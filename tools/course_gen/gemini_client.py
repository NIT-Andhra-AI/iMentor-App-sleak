"""
Gemini client for Student AI course generation.

PRIMARY backend : `gemini` CLI  (FREE — no API cost, equally powerful)
FALLBACK backend: google-genai / google-generativeai Python SDK

CLI is always tried first. SDK only used if CLI subprocess fails.
On Windows, resolves Bun global bin automatically.

Environment variables:
    GEMINI_MODEL   — model override (default: gemini-2.5-pro)
    GEMINI_API_KEY — SDK fallback key
    GEMINI_USE_SDK — set to '1' to force SDK instead of CLI
"""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import subprocess
import time
from typing import Optional

logger = logging.getLogger(__name__)

# ── Config ────────────────────────────────────────────────────────────────────
PRO_MODEL      = os.getenv("GEMINI_MODEL", "gemini-2.5-pro")
FAST_MODEL     = PRO_MODEL           # CLI is free — always use pro
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "AIzaSyAwtMnjyTcSqGOiodZ2fxTO3b8STMmnHa0")
FORCE_SDK      = os.getenv("GEMINI_USE_SDK", "0") == "1"


# ── Resolve gemini executable (Bun-only global/bin lookup) ───────────────────

def _find_gemini_exe() -> Optional[str]:
    """Return the full path to the gemini CLI, or None if not found."""
    # 1. Already on PATH via shutil (works on Linux/macOS, sometimes Windows)
    for name in ("gemini", "gemini.cmd"):
        found = shutil.which(name)
        if found:
            return found

    # 2. Bun global bin on Windows/Linux/macOS
    bun_global = os.path.join(os.path.expanduser("~"), ".bun", "bin")
    for name in ("gemini", "gemini.cmd", "gemini.ps1"):
        p = os.path.join(bun_global, name)
        if os.path.isfile(p):
            return p

    return None


# Cache resolved values
_GEMINI_EXE: Optional[str] = None
_CLI_OK: Optional[bool] = None


def _cli_available() -> bool:
    global _CLI_OK, _GEMINI_EXE
    if _CLI_OK is not None:
        return _CLI_OK
    _GEMINI_EXE = _find_gemini_exe()
    _CLI_OK = _GEMINI_EXE is not None
    if _CLI_OK:
        logger.info("Gemini CLI found: %s ✓", _GEMINI_EXE)
    else:
        logger.warning("Gemini CLI NOT found — will use SDK fallback")
    return _CLI_OK


def _cli_generate(
    prompt: str,
    system: str = "",
    model: str = "",
    timeout: int = 360,
    retries: int = 3,
) -> Optional[str]:
    """Run gemini CLI with the prompt. Uses full exe path to bypass PATH issues."""
    if not _cli_available() or _GEMINI_EXE is None:
        return None

    model = model or PRO_MODEL
    full  = f"{system}\n\n{prompt}" if system else prompt

    for attempt in range(1, retries + 1):
        try:
            result = subprocess.run(
                [_GEMINI_EXE, "-m", model, "-p", full],
                capture_output=True,
                text=True,
                timeout=timeout,
                encoding="utf-8",
                errors="replace",
            )
            out = result.stdout.strip()
            if result.returncode == 0 and out:
                return out

            stderr = result.stderr[:400]
            if "429" in stderr or "capacity" in stderr.lower() or "quota" in stderr.lower():
                wait = 30 * attempt
                logger.warning("CLI rate-limit attempt %d/%d — waiting %ds …", attempt, retries, wait)
                time.sleep(wait)
                continue

            logger.warning("CLI rc=%d stderr=%s", result.returncode, stderr)
            if attempt < retries:
                time.sleep(5)

        except subprocess.TimeoutExpired:
            logger.warning("CLI timeout %ds attempt %d/%d", timeout, attempt, retries)
            if attempt < retries:
                time.sleep(5)
        except Exception as exc:
            logger.error("CLI subprocess error: %s", exc)
            return None

    return None


# ── SDK backend (fallback) ────────────────────────────────────────────────────

_genai      = None
_sdk_ready  = False


def _init_sdk() -> bool:
    global _genai, _sdk_ready
    if _sdk_ready:
        return True
    # Try new google-genai package first, fall back to deprecated google-generativeai
    try:
        import google.genai as genai   # type: ignore
        _genai = genai
        _sdk_ready = True
        logger.info("google-genai SDK ready (fallback)")
        return True
    except ImportError:
        pass
    try:
        import google.generativeai as genai  # type: ignore  # noqa: F401
        genai.configure(api_key=GEMINI_API_KEY)
        _genai = genai
        _sdk_ready = True
        logger.info("google-generativeai SDK ready (fallback)")
        return True
    except ImportError:
        logger.warning("Neither google-genai nor google-generativeai installed")
        return False
    except Exception as exc:
        logger.warning("SDK init failed: %s", exc)
        return False


def _sdk_generate(
    prompt: str,
    system: str = "",
    temperature: float = 0.4,
    max_tokens: int = 8192,
    retries: int = 3,
) -> Optional[str]:
    if not _init_sdk() or _genai is None:
        return None

    # Try requested/default model first, then safe fallbacks that are commonly
    # available across Gemini API versions.
    model_candidates = []
    for m in (
        PRO_MODEL,
        FAST_MODEL,
        "gemini-2.5-pro",
        "gemini-2.0-flash",
        "gemini-1.5-flash-latest",
        "gemini-1.5-flash",
    ):
        if m and m not in model_candidates:
            model_candidates.append(m)

    for attempt in range(1, retries + 1):
        for model_name in model_candidates:
            try:
                cfg  = {"temperature": temperature, "max_output_tokens": max_tokens}
                kw   = {"system_instruction": system} if system else {}
                m    = _genai.GenerativeModel(
                    model_name,
                    generation_config=_genai.GenerationConfig(**cfg),
                    **kw,
                )
                resp = m.generate_content(prompt)
                if resp.text:
                    return resp.text.strip()
            except Exception as exc:
                err = str(exc)

                # Try next model if this one is unavailable.
                if "not found" in err.lower() or "unsupported" in err.lower():
                    logger.warning("SDK model unavailable: %s", model_name)
                    continue

                if "429" in err or "quota" in err.lower():
                    time.sleep(20 * attempt)
                    break

                logger.error("SDK error (%s): %s", model_name, exc)
                return None

        # If we exhausted models this attempt, retry outer loop (handles transient
        # API errors and quota windows).
    return None


# ── Public API ────────────────────────────────────────────────────────────────

def generate(
    prompt: str,
    system: str = "",
    temperature: float = 0.4,
    max_tokens: int = 8192,
    timeout: int = 360,
) -> Optional[str]:
    """Generate text — CLI first (free + pro quality), SDK fallback."""
    if not FORCE_SDK and _cli_available():
        result = _cli_generate(prompt=prompt, system=system, timeout=timeout)
        if result:
            return result
        logger.info("CLI returned nothing, trying SDK …")
    return _sdk_generate(prompt=prompt, system=system, temperature=temperature, max_tokens=max_tokens)


def generate_long(prompt: str, system: str = "", temperature: float = 0.35) -> Optional[str]:
    """Generate long-form content (wiki pages). CLI handles large outputs natively."""
    return generate(prompt=prompt, system=system, temperature=temperature, timeout=420)


def generate_json(prompt: str, system: str = "", temperature: float = 0.2) -> Optional[dict]:
    """Generate and parse a JSON response."""
    sys2 = (system + "\n" if system else "") + "Output valid JSON ONLY. No markdown fences."
    raw  = generate(prompt=prompt, system=sys2, temperature=temperature)
    if not raw:
        return None
    cleaned = re.sub(r"^```(?:json)?\n?", "", raw.strip())
    cleaned = re.sub(r"\n?```$",           "", cleaned.strip())
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error("JSON parse error: %s\nSnippet: %s", exc, raw[:400])
        return None


def check_health() -> dict:
    """Check which backends are available."""
    cli_ok = _cli_available()
    sdk_ok = _init_sdk()
    return {
        "cli_available" : cli_ok,
        "cli_exe"       : _GEMINI_EXE,
        "sdk_available" : sdk_ok,
        "active_backend": "cli" if (cli_ok and not FORCE_SDK) else ("sdk" if sdk_ok else "none"),
        "model"         : PRO_MODEL,
        "api_key_set"   : bool(GEMINI_API_KEY),
    }
