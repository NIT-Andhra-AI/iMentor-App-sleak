"""
LLM client for Student AI course generation.

Uses the llama-cpp-python OpenAI-compatible server (http://127.0.0.1:8080/v1).
This is a drop-in replacement for the NIT-Andhra-AI sglang_client.py.

Same interface:
  generate(system, user, params) -> str | None
  generate_structured(system, user, schema_model, ...) -> dict | None
"""
import json
import logging
from typing import Optional, Type

from pydantic import BaseModel

from course_gen import config

logger = logging.getLogger(__name__)

_client = None


def _get_client():
    global _client
    if _client is not None:
        return _client
    if not config.LLM_ENABLED:
        return None
    try:
        from openai import OpenAI
        _client = OpenAI(base_url=config.LLM_URL, api_key="not-needed")
        logger.info("LLM client ready  url=%s", config.LLM_URL)
    except ImportError:
        logger.error("openai package not installed. Run: pip install openai")
        _client = None
    return _client


def check_health() -> bool:
    """Ping the llama-cpp-python server's /models endpoint."""
    client = _get_client()
    if client is None:
        return False
    try:
        client.models.list()
        return True
    except Exception as exc:
        logger.warning("LLM server health check failed: %s", exc)
        return False


def generate(
    system: str,
    user: str,
    params: Optional[dict] = None,
) -> Optional[str]:
    """Plain text generation via llama-cpp-python server."""
    p = params or config.NOTE_PARAMS
    client = _get_client()
    if not client:
        logger.error("LLM client not available. Is the server running on %s?", config.LLM_URL)
        return None

    messages = [
        {"role": "system", "content": system},
        {"role": "user",   "content": user},
    ]
    try:
        resp = client.chat.completions.create(
            model=config.LLM_MODEL,
            messages=messages,
            temperature=p.get("temperature", 0.3),
            max_tokens=p.get("max_tokens", 3000),
        )
        content = resp.choices[0].message.content
        return content.strip() if content else None
    except Exception as exc:
        logger.error("LLM generation failed: %s", exc)
        return None


def generate_structured(
    system: str,
    user: str,
    schema_model: Type[BaseModel],
    schema_name: str = "response_schema",
    params: Optional[dict] = None,
) -> Optional[dict]:
    """
    Constrained JSON generation.
    Tries json_schema format first (llama-cpp-python >= 0.2.x with grammar support).
    Falls back to json_object format with schema in prompt if the server doesn't support it.
    """
    p = params or config.SCHEMA_PARAMS
    client = _get_client()
    if not client:
        logger.error("LLM client not available. Is the server running on %s?", config.LLM_URL)
        return None

    schema_json = schema_model.model_json_schema()
    messages = [
        {
            "role": "system",
            "content": (
                f"{system}\n"
                f"Output ONLY valid JSON matching this schema:\n"
                f"{json.dumps(schema_json, indent=2)}"
            ),
        },
        {"role": "user", "content": user},
    ]

    # Attempt 1: json_schema (grammar-based, most reliable)
    for max_tok in [p.get("max_tokens", 3000), 4500, 6000]:
        try:
            resp = client.chat.completions.create(
                model=config.LLM_MODEL,
                messages=messages,
                response_format={
                    "type": "json_schema",
                    "json_schema": {
                        "name":   schema_name,
                        "schema": schema_json,
                        "strict": True,
                    },
                },
                temperature=p.get("temperature", 0.1),
                max_tokens=max_tok,
            )
            finish = resp.choices[0].finish_reason
            raw = resp.choices[0].message.content
            if finish == "length" and max_tok < 6000:
                logger.warning("Response truncated at %d tokens, retrying", max_tok)
                continue
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("JSON parse error with json_schema format, retrying")
            continue
        except Exception as exc:
            logger.warning("json_schema format failed: %s — trying json_object fallback", exc)
            break

    # Attempt 2: json_object fallback (schema in prompt only)
    try:
        resp = client.chat.completions.create(
            model=config.LLM_MODEL,
            messages=messages,
            response_format={"type": "json_object"},
            temperature=p.get("temperature", 0.1),
            max_tokens=p.get("max_tokens", 3000),
        )
        raw = resp.choices[0].message.content or ""
        # Strip markdown fences if model added them
        if raw.startswith("```"):
            lines = raw.splitlines()
            raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
            if raw.startswith("json"):
                raw = raw[4:]
        return json.loads(raw.strip())
    except Exception as exc:
        logger.error("json_object fallback also failed: %s", exc)
        return None
