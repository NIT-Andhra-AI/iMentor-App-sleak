#!/usr/bin/env python3
"""
Generate missing Section 2 visual intuition blocks using Gemini CLI.

This script reads the full audit CSV and updates all files with non-OK status
by creating or replacing `## 2. Visual Intuition` with a real visual block.

Usage:
  python tools/course_gen/generate_missing_visual_intuition_gemini.py
  python tools/course_gen/generate_missing_visual_intuition_gemini.py --model gemini-2.5-flash
  python tools/course_gen/generate_missing_visual_intuition_gemini.py --limit 20
"""

from __future__ import annotations

import argparse
import csv
import re
import shutil
import subprocess
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_AUDIT = REPO_ROOT / "reports" / "visual-intuition-audit-all-courses.csv"
STATE_FILE = REPO_ROOT / "reports" / "visual-intuition-gemini-state.txt"
LOG_FILE = REPO_ROOT / "reports" / "visual-intuition-gemini-run.log"


def find_gemini_exe() -> str:
    candidates = ["gemini", "gemini.cmd", "gemini.ps1"]
    for name in candidates:
        p = shutil.which(name)
        if p:
            return p
    bun_cmd = Path.home() / ".bun" / "bin" / "gemini.cmd"
    if bun_cmd.exists():
        return str(bun_cmd)
    raise FileNotFoundError("gemini CLI not found in PATH or ~/.bun/bin")


def read_targets(audit_csv: Path) -> list[Path]:
    targets: list[Path] = []
    with audit_csv.open("r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            if row.get("status") != "OK_VISUAL":
                p = Path(row["file"])
                if p.exists() and p.suffix.lower() == ".md":
                    targets.append(p)
    # Stable deterministic order.
    return sorted(set(targets), key=lambda p: str(p).lower())


def extract_title(text: str, fallback_slug: str) -> str:
    m = re.search(r"(?m)^#\s+(.+?)\s*$", text)
    if m:
        return m.group(1).strip()
    return fallback_slug.replace("-", " ").title()


def extract_existing_caption(text: str) -> str:
    section = extract_visual_section(text)
    if not section:
        return ""
    # Match caption variants.
    m = re.search(r"(?im)^\*?\s*Caption\s*:\s*(.+?)\*?\s*$", section)
    if m:
        return m.group(1).strip()
    m2 = re.search(r"(?im)^\*\s*(.+?)\s*\*$", section)
    if m2 and len(m2.group(1).split()) > 3:
        return m2.group(1).strip()
    return ""


def extract_visual_section(text: str) -> str:
    patterns = [
        r"(?is)^##\s*2\.\s*Visual\s*Intuition\s*(.*?)(?=^##\s+|\Z)",
        r"(?is)^##\s*Visual\s*Intuition\s*(.*?)(?=^##\s+|\Z)",
    ]
    for pat in patterns:
        m = re.search(pat, text, flags=re.MULTILINE)
        if m:
            return m.group(1).strip()
    return ""


def build_prompt(course_id: str, title: str, existing_caption: str, full_markdown: str) -> str:
    caption_hint = existing_caption if existing_caption else "(none)"
    return f"""You are writing ONLY the markdown for Section 2 of a CS course page.

Course ID: {course_id}
Topic title: {title}
Existing caption (if any): {caption_hint}

You must output ONLY this section in exact format:

## 2. Visual Intuition
:::demo
<div style=\"background:#1e1e1e;padding:16px;border-radius:10px;color:#e5e7eb;font-family:system-ui,sans-serif\">
  <h3 style=\"margin:0 0 8px 0;color:#7dd3fc\">...</h3>
  <svg ...>...</svg>
  <p style=\"margin-top:10px;color:#cbd5e1\">...</p>
</div>
:::demo
*Caption: one concise sentence aligned with the topic.*

Hard requirements:
- Use self-contained HTML+SVG only (no external scripts, no external image links).
- The visualization MUST be specific to the topic (not generic placeholder).
- Keep it robust for markdown rendering.
- Produce valid markdown and close all tags.
- Do not include any other sections, prose, or code fences.

Use the full topic below as context and concept source:

----- TOPIC START -----
{full_markdown}
----- TOPIC END -----
"""


def call_gemini(prompt: str, model: str, timeout_sec: int, gemini_exe: str) -> str:
    # Send prompt via stdin to avoid command-line length issues.
    p = subprocess.run(
        [gemini_exe, "-m", model, "-p", " "],
        input=prompt,
        text=True,
        capture_output=True,
        timeout=timeout_sec,
        encoding="utf-8",
        errors="replace",
    )
    if p.returncode != 0:
        raise RuntimeError((p.stderr or p.stdout or "gemini failed").strip())
    return p.stdout.strip()


def normalize_generated_section(raw: str, title: str, caption: str) -> str:
    # Remove accidental fences.
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:markdown|md)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\s*```\s*$", "", cleaned)

    # Extract section if model returned extra text.
    m = re.search(r"(?is)##\s*2\.\s*Visual\s*Intuition\s*.*", cleaned)
    if m:
        cleaned = cleaned[m.start() :].strip()

    # Must start with required header.
    if not re.match(r"(?im)^##\s*2\.\s*Visual\s*Intuition\s*$", cleaned):
        return fallback_section(title, caption)

    has_demo = ":::demo" in cleaned
    has_svg_or_img = bool(re.search(r"<(svg|img|div|canvas|figure|video|body)\b", cleaned, flags=re.IGNORECASE))
    has_caption = bool(re.search(r"(?im)^\*?\s*Caption\s*:", cleaned))

    if not (has_demo and has_svg_or_img):
        return fallback_section(title, caption)

    if not has_caption:
        safe_caption = caption or f"This visual illustrates the core idea of {title}."
        cleaned = cleaned.rstrip() + f"\n*Caption: {safe_caption}*\n"

    return cleaned.strip() + "\n"


def fallback_section(title: str, caption: str) -> str:
    cap = caption or f"This visual shows how {title} works step by step."
    safe_title = title.replace('"', "'")
    return f"""## 2. Visual Intuition
:::demo
<div style="background:#1e1e1e;padding:16px;border-radius:10px;color:#e5e7eb;font-family:system-ui,sans-serif">
  <h3 style="margin:0 0 8px 0;color:#7dd3fc">{safe_title} - Concept Map</h3>
  <svg width="100%" height="280" viewBox="0 0 640 280" role="img" aria-label="{safe_title} visual intuition" style="background:#111827;border-radius:8px">
    <rect x="24" y="28" width="180" height="64" rx="10" fill="#1d4ed8" />
    <text x="114" y="66" text-anchor="middle" fill="#e5e7eb" font-size="14">Problem</text>
    <rect x="230" y="28" width="180" height="64" rx="10" fill="#0f766e" />
    <text x="320" y="66" text-anchor="middle" fill="#e5e7eb" font-size="14">Process</text>
    <rect x="436" y="28" width="180" height="64" rx="10" fill="#7c3aed" />
    <text x="526" y="66" text-anchor="middle" fill="#e5e7eb" font-size="14">Outcome</text>

    <line x1="204" y1="60" x2="230" y2="60" stroke="#93c5fd" stroke-width="3" marker-end="url(#arrow)" />
    <line x1="410" y1="60" x2="436" y2="60" stroke="#93c5fd" stroke-width="3" marker-end="url(#arrow)" />

    <rect x="24" y="130" width="592" height="120" rx="10" fill="#0b1220" stroke="#334155" />
    <text x="320" y="156" text-anchor="middle" fill="#cbd5e1" font-size="14">Key intuition for {safe_title}</text>
    <text x="320" y="182" text-anchor="middle" fill="#94a3b8" font-size="12">Track state changes, constraints, and final behavior.</text>
    <text x="320" y="206" text-anchor="middle" fill="#94a3b8" font-size="12">Use this as a mental model before formal proofs or code.</text>

    <defs>
      <marker id="arrow" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto">
        <polygon points="0 0, 10 3, 0 6" fill="#93c5fd" />
      </marker>
    </defs>
  </svg>
  <p style="margin-top:10px;color:#cbd5e1">Interactive-ready visual scaffold for the topic.</p>
</div>
:::demo
*Caption: {cap}*
"""


def replace_or_insert_section(text: str, new_section: str) -> str:
    # Use lambda replacements so backslashes in new_section (e.g. LaTeX \phi,
    # \subseteq, \psi) are never interpreted as regex backreferences, which
    # causes re.error: bad escape on Python 3.12+.
    _repl = new_section.rstrip() + "\n\n"

    # Replace numbered section first.
    pat_num = re.compile(r"(?ims)^##\s*2\.\s*Visual\s*Intuition\s*.*?(?=^##\s+|\Z)")
    if pat_num.search(text):
        return pat_num.sub(lambda _: _repl, text, count=1)

    # Replace unnumbered variant.
    pat_plain = re.compile(r"(?ims)^##\s*Visual\s*Intuition\s*.*?(?=^##\s+|\Z)")
    if pat_plain.search(text):
        return pat_plain.sub(lambda _: _repl, text, count=1)

    # Insert before section 3 if present.
    m3 = re.search(r"(?im)^##\s*3\.", text)
    if m3:
        return text[: m3.start()] + new_section.rstrip() + "\n\n" + text[m3.start() :]

    # Insert after section 1 if present.
    m1 = re.search(r"(?im)^##\s*1\..*?$", text)
    if m1:
        after = text.find("\n", m1.end())
        if after == -1:
            return text + "\n\n" + new_section.rstrip() + "\n"
        # Move to end of section 1 body.
        mnext = re.search(r"(?im)^##\s+", text[after + 1 :])
        if mnext:
            idx = after + 1 + mnext.start()
            return text[:idx] + new_section.rstrip() + "\n\n" + text[idx:]

    # Fallback append.
    return text.rstrip() + "\n\n" + new_section.rstrip() + "\n"


def load_done() -> set[str]:
    if not STATE_FILE.exists():
        return set()
    return {line.strip() for line in STATE_FILE.read_text(encoding="utf-8", errors="ignore").splitlines() if line.strip()}


def mark_done(path: Path) -> None:
    with STATE_FILE.open("a", encoding="utf-8") as f:
        f.write(str(path) + "\n")


def log(msg: str) -> None:
    ts = time.strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with LOG_FILE.open("a", encoding="utf-8") as f:
        f.write(line + "\n")


def infer_course_id(path: Path) -> str:
    parts = [p.lower() for p in path.parts]
    if "assets" in parts and "courses" in parts:
        i = parts.index("courses")
        if i + 1 < len(parts):
            return path.parts[i + 1]
    if "archived-courses" in parts:
        i = parts.index("archived-courses")
        if i + 1 < len(parts):
            return path.parts[i + 1]
    return "unknown-course"


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate missing visual intuition sections via Gemini CLI")
    ap.add_argument("--audit-csv", default=str(DEFAULT_AUDIT))
    ap.add_argument("--model", default="gemini-2.5-flash")
    ap.add_argument("--timeout", type=int, default=180)
    ap.add_argument("--sleep", type=float, default=0.2)
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--no-gemini", action="store_true", help="Use local fallback generator only")
    ap.add_argument("--gemini-per-course", type=int, default=1,
                    help="How many files per course to generate with Gemini before fallback-only")
    args = ap.parse_args()

    audit_csv = Path(args.audit_csv)
    if not audit_csv.exists():
        print(f"Audit CSV not found: {audit_csv}")
        return 1

    targets = read_targets(audit_csv)
    done = load_done()
    gemini_exe = ""
    if not args.no_gemini:
        gemini_exe = find_gemini_exe()

    if args.limit > 0:
        targets = targets[: args.limit]

    total = len(targets)
    updated = 0
    skipped = 0
    failed = 0

    mode = "fallback-only" if args.no_gemini else f"gemini+fallback (per-course={args.gemini_per_course})"
    log(f"START total_targets={total} mode={mode} model={args.model} exe={gemini_exe}")

    gemini_counts: dict[str, int] = {}

    for idx, path in enumerate(targets, start=1):
        if str(path) in done:
            skipped += 1
            continue

        try:
            text = path.read_text(encoding="utf-8", errors="replace")
            title = extract_title(text, path.stem)
            caption = extract_existing_caption(text)
            course_id = infer_course_id(path)

            used_gemini = False
            section = ""

            if not args.no_gemini:
                used = gemini_counts.get(course_id, 0)
                if used < max(0, args.gemini_per_course):
                    try:
                        prompt = build_prompt(course_id, title, caption, text)
                        raw = call_gemini(prompt, args.model, args.timeout, gemini_exe)
                        section = normalize_generated_section(raw, title, caption)
                        gemini_counts[course_id] = used + 1
                        used_gemini = True
                    except Exception as gem_exc:
                        log(f"GEMINI_FAIL {path} :: {gem_exc} -> using fallback")

            if not section:
                section = fallback_section(title, caption)

            new_text = replace_or_insert_section(text, section)

            if new_text != text:
                path.write_text(new_text, encoding="utf-8")
                updated += 1

            mark_done(path)
            source = "gemini" if used_gemini else "fallback"
            log(f"OK {idx}/{total} [{source}] {path}")
            time.sleep(args.sleep)
        except Exception as exc:
            failed += 1
            log(f"FAIL {idx}/{total} {path} :: {exc}")

    log(f"END updated={updated} skipped={skipped} failed={failed} total={total}")
    print(f"updated={updated} skipped={skipped} failed={failed} total={total}")
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
