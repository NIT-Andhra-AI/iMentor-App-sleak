#!/usr/bin/env python3
"""
CLI Expander — generates textbook-quality course pages using the Gemini CLI
(gemini -p ...) instead of the paid API. Free tier via Google account auth.

Usage:
    python tools/course_gen/cli_expander.py --all
    python tools/course_gen/cli_expander.py --course-id algorithms
    python tools/course_gen/cli_expander.py --course-id algorithms --overwrite
    python tools/course_gen/cli_expander.py --all --skip compiler-design dsa-placement
"""
from __future__ import annotations

import argparse
import datetime
import json
import logging
import re
import subprocess
import sys
import time
from pathlib import Path
from typing import List, Optional

_THIS_DIR  = Path(__file__).parent.resolve()
_REPO_ROOT = _THIS_DIR.parent.parent.resolve()
sys.path.insert(0, str(_THIS_DIR))

from gemini_build_courses import ALL_COURSES, CourseSpec
from direct_api_generator import COURSES_DIR

# ── CLI model config ──────────────────────────────────────────────────────────
# Use gemini-2.5-pro for deep/complex topics, gemini-2.5-flash for faster output
CLI_MODEL_PRO   = "gemini-2.5-pro"
CLI_MODEL_FLASH = "gemini-2.5-flash"
_GEN_MODEL = CLI_MODEL_PRO   # default: pro for best quality

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s ─ %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("cli_exp")

SYLLABI_DIR = _THIS_DIR / "textbook_syllabi"

# ── Prompt templates (identical to textbook_expander.py) ─────────────────────
_PAGE_SYSTEM_TEXTBOOK = """You are a world-class professor writing a university textbook chapter.
Your audience: undergraduate/graduate students at top universities preparing for technical roles at FAANG/top companies.
Standard: MIT OpenCourseWare + CLRS + real industry experience combined.
Every section must be substantive — no filler, no hand-waving.
Minimum 2500 words of prose (not counting code blocks).
This page must be a COMPLETE standalone reference — the reader needs nothing else."""

TEXTBOOK_FORMAT = """
Each page MUST contain ALL of the following sections (no placeholders, every section fully populated):

```
---
course: <course-id>
topic: <slug>
title: <Full Topic Title>
difficulty: <beginner|intermediate|advanced>
tags: [tag1, tag2, tag3, tag4, tag5]
placement_domains: [domain1, domain2]
has_interactive: true
has_quiz: false
has_code: true
has_gif: true
---

# <Topic Title>

> **One-sentence definition** — precise, memorable, technically correct.

## 1. Historical Background & Motivation
(2 paragraphs minimum: Who invented/discovered this? When? What problem did it solve?
 How did it evolve? Why does it matter in modern computing/engineering?)

## 2. Visual Intuition
![Animated illustration](https://upload.wikimedia.org/wikipedia/commons/...)
*Caption: What the animation shows*

## 3. Core Theory & Mathematical Foundations
(4-6 paragraphs of deep technical explanation. Use sub-sections (###) for each major concept.
 Include ALL relevant math with LaTeX: $inline$ and $$display block$$.
 Cover formal definitions, theorems, proofs or proof sketches, lemmas where relevant.)

### 3.1 <First Major Sub-Concept>
...

### 3.2 <Second Major Sub-Concept>
...

### 3.3 Formal Analysis (Complexity / Correctness)
(Derive time and space complexity. Prove or sketch correctness arguments.)

## 4. Algorithm / Process (Step-by-Step)
(Numbered steps or pseudocode describing the exact procedure. Every step explained.)

## 5. Visual Diagram
```mermaid
(Meaningful diagram: flowchart TD, graph LR, sequenceDiagram, classDiagram, stateDiagram-v2, gantt, etc.
 Must accurately represent the concept — not generic.)
```
*Caption: What this diagram illustrates*

## 6. Implementation

### 6.1 Core Implementation
```<LANG>
# Complete, well-commented, runnable implementation
# Every function documented with: purpose, args, returns, complexity
# Include sample input/output as comments
```

### 6.2 Optimized / Production Variant
```<LANG>
# Show a more optimized or real-world variant with explanation
```

### 6.3 Common Pitfalls in Code
(3-4 bullet points: edge cases that trip up implementers, off-by-one errors, etc.)

## 7. Interactive Demo
:::demo
<!-- title: <Descriptive demo title> -->
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin:0; background:#0f1117; color:#e5e7eb; font-family: system-ui, sans-serif; font-size:13px; padding:16px; }
  /* All styles inline — comprehensive, polished UI */
</style>
</head>
<body>
<!-- 
  REQUIREMENTS:
  - Self-contained vanilla HTML/CSS/JS — zero external libraries
  - Visually demonstrates the core concept with animation
  - Has interactive controls: play/pause, step-by-step, speed, reset
  - Shows internal state clearly (array values, pointers, counters, etc.)
  - Minimum 80 lines of JavaScript
-->
<script>
  // All logic inline. requestAnimationFrame for smooth animation.
</script>
</body>
</html>
:::

## 8. Worked Examples

### Example 1 — Basic Application
(Complete worked example with ALL intermediate steps shown numerically. 
 Show the state at each step. Explain each decision.)

### Example 2 — Complex / Edge Case
(A harder example demonstrating a non-trivial application or edge case.)

## 9. Comparison with Alternatives
| Approach | Time | Space | Pros | Cons | Best Used When |
|---|---|---|---|---|---|
| This method | O(...) | O(...) | ... | ... | ... |
| Alternative 1 | O(...) | O(...) | ... | ... | ... |
| Alternative 2 | O(...) | O(...) | ... | ... | ... |

## 10. Industry Applications & Real Systems
- **[Company/System]**: Exactly how this concept is applied, at what scale, why this approach was chosen.
- **[Company/System]**: ...
- **[Domain]**: Real-world systems that depend on this

(Minimum 4 detailed real-world applications with specific company/system names)

## 11. Practice Problems

### 🟢 Easy
1. **[Problem title]**: [Full problem statement with constraints]
   *Hint: [Specific, useful hint]*
   *Expected complexity: O(...)*

### 🟡 Medium
2. **[Problem title]**: [Full problem statement]*
   *Hint: [Hint]*
   *Expected complexity: O(...)*

3. **[Problem title]**: [Full problem statement]*

### 🔴 Hard
4. **[Problem title]**: [Full problem statement — challenging, interview-level]
   *Hint: [Hint]*
   *Expected complexity: O(...)*

5. **[LeetCode/Codeforces-style problem]**: [Problem with constraints typical of competitive programming]

## 12. Interview Preparation

### Conceptual Questions
**Q: Explain [topic] as if teaching it to a fellow engineer.**

**Q: What are the time and space complexities? Derive them.**

**Q: How would you choose between [this] and [alternative] in a real system?**

**Q: [Classic follow-up question]**

**Q: [System design question involving this concept]**

Add at least 8 questions total. Include a mix of common fundamentals and tough edge-case/design questions.
Do not include answers or hints.

### Quick Reference (Cheat Sheet)
| Property | Value |
|---|---|
| Time Complexity | O(...) |
| Space Complexity | O(...) |
| [Other key property] | ... |

## 13. Key Takeaways
1. [Most important concept — the core insight]
2. [Critical complexity result or mathematical fact]
3. [Practical engineering insight]
4. [Common mistake to avoid]
5. [Connection to broader field]
6. [Interview tip]
7. [When to use this vs alternatives]

## 14. Common Misconceptions
- ❌ **[Wrong belief]** → ✅ **[Correct understanding with brief explanation]**
- ❌ **[Wrong belief]** → ✅ **[Correct understanding]**
- ❌ **[Wrong belief]** → ✅ **[Correct understanding]**

## 15. Further Reading
- *[Textbook name, Author, Chapter X]* — [What to read there]
- *[CLRS/SICP/Dragon Book/etc.]* — [Specific section]
- [Online resource] — [What it covers]
- [Original paper/seminal work] — [Why it's worth reading]

## 16. Related Topics
- [<Topic Title>](<topic-slug>.md) — [How it relates]
- [<Topic Title>](<topic-slug>.md) — [How it relates]
- [<Topic Title>](<topic-slug>.md) — [How it relates]
- [<Topic Title>](<topic-slug>.md) — [How it relates]
```
"""


def _find_gemini() -> str:
    """Locate the gemini CLI executable (handles Windows .cmd wrapper)."""
    import shutil
    for name in ("gemini", "gemini.cmd", "gemini.ps1"):
        p = shutil.which(name)
        if p:
            return p
    # Fallback to known global bin locations on Windows
    bun_path = Path.home() / ".bun" / "bin" / "gemini.cmd"
    if bun_path.exists():
        return str(bun_path)

    raise FileNotFoundError(
        "gemini CLI not found. Install with: bun add -g @google/gemini-cli"
    )

_GEMINI_EXE = None

def _call_cli(prompt: str, model: str = _GEN_MODEL, retries: int = 3,
              timeout: int = 900) -> Optional[str]:
    """Call Gemini CLI in headless mode and return the text output."""
    global _GEMINI_EXE
    if _GEMINI_EXE is None:
        _GEMINI_EXE = _find_gemini()
        logger.info("Using Gemini CLI: %s", _GEMINI_EXE)

    for attempt in range(1, retries + 1):
        try:
            # Pass prompt via stdin to avoid Windows 32k command-line limit.
            # -p " " triggers non-interactive (headless) mode; stdin content
            # is prepended to the -p value as the final prompt.
            result = subprocess.run(
                [_GEMINI_EXE, "-m", model, "-p", " "],
                input=prompt,
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=timeout,
                shell=False,
            )
            if result.returncode == 0 and result.stdout.strip():
                return result.stdout.strip()

            stderr = result.stderr.strip()
            logger.warning("CLI attempt %d/%d returned code %d: %s",
                           attempt, retries, result.returncode, stderr[:200])

            # Rate limit / overload — wait before retry
            if "429" in stderr or "quota" in stderr.lower() or "rate" in stderr.lower():
                wait = 60 * attempt
                logger.info("Rate limited — waiting %ds before retry", wait)
                time.sleep(wait)
            elif "503" in stderr or "overload" in stderr.lower():
                wait = 30 * attempt
                logger.info("Overloaded — waiting %ds before retry", wait)
                time.sleep(wait)
            else:
                time.sleep(10)

        except subprocess.TimeoutExpired:
            logger.warning("CLI timeout on attempt %d/%d", attempt, retries)
            time.sleep(15)
        except Exception as e:
            logger.error("CLI error attempt %d: %s", attempt, e)
            time.sleep(10)

    return None


def generate_textbook_page(course: CourseSpec, slug: str, title: str,
                            context_topics: List[str],
                            model: str = _GEN_MODEL) -> Optional[str]:
    """Generate a deep textbook-quality wiki page via Gemini CLI."""
    related = ", ".join(f"[{t.replace('-', ' ').title()}]({t}.md)" for t in context_topics[:8] if t != slug)
    prompt = f"""{_PAGE_SYSTEM_TEXTBOOK}

Generate a complete textbook chapter page for:

**Course:** {course.title}
**Topic:** {title}
**Slug:** {slug}
**Target roles:** {', '.join(course.placement_domains)}
**Code language:** {course.code_lang}
**Other topics in this course (for cross-referencing):** {related}

{TEXTBOOK_FORMAT}

CRITICAL REQUIREMENTS:
- Page title: # {title}
- Code in {course.code_lang} — complete, runnable, well-commented with expected outputs shown
- LaTeX math: $inline$ and $$block$$ (mandatory for any mathematical content)  
- Wikimedia GIF URL from your knowledge (format: ![desc](https://upload.wikimedia.org/...))
- Mermaid diagram: valid syntax, accurately represents the concept
- :::demo block: minimum 100 lines of vanilla JS, polished interactive visualization
- Do not include quiz/MCQ/test sections
- Interview section must contain questions only (minimum 8), no answers
- All sections above must be present and fully populated
- Minimum 2500 words of prose content
- Cross-references use standard markdown links: [topic title](topic-slug.md)
- Do not print YAML frontmatter keys/values again inside the body text

Generate the complete chapter now (start directly with the YAML frontmatter ---):"""

    return _call_cli(prompt, model=model)


def process_course(course: CourseSpec, overwrite: bool = False,
                   model: str = _GEN_MODEL) -> dict:
    """Process one course: load syllabus, generate missing pages via CLI."""
    wiki_dir = COURSES_DIR / course.id / "wiki"
    wiki_dir.mkdir(parents=True, exist_ok=True)
    syllabus_file = SYLLABI_DIR / f"{course.id}.json"

    if not syllabus_file.exists():
        logger.warning("No syllabus file: %s — skipping", syllabus_file)
        return {"course": course.id, "generated": 0, "skipped": 0, "failed": []}

    data = json.loads(syllabus_file.read_text(encoding="utf-8"))
    topics = data.get("topics", [])
    if not topics:
        logger.warning("Empty topics in %s", syllabus_file)
        return {"course": course.id, "generated": 0, "skipped": 0, "failed": []}

    existing = {f.stem for f in wiki_dir.glob("*.md")}
    all_slugs = [t["slug"] for t in topics]

    to_generate = [t for t in topics if t["slug"] not in existing or overwrite]
    to_generate = [t for t in to_generate if t["slug"] != "index"]

    logger.info("━" * 60)
    logger.info("  %s: %d total topics, %d to generate (%d existing)",
                course.title, len(topics), len(to_generate), len(existing))
    logger.info("━" * 60)

    generated, failed = 0, []

    for i, topic in enumerate(to_generate):
        slug, title = topic["slug"], topic["title"]
        logger.info("[%d/%d] %s / %s", i + 1, len(to_generate), course.id, slug)

        content = generate_textbook_page(course, slug, title, all_slugs, model=model)
        if content:
            # Ensure YAML frontmatter present
            if not content.strip().startswith("---"):
                fm = f"---\ncourse: {course.id}\ntopic: {slug}\ntitle: \"{title}\"\n---\n\n"
                content = fm + content
            out = wiki_dir / f"{slug}.md"
            out.write_text(content, encoding="utf-8")
            generated += 1
            logger.info("  ✓ %d chars → %s.md", len(content), slug)
        else:
            failed.append(slug)
            logger.warning("  ✗ Failed: %s", slug)

        time.sleep(3)  # small pause between pages

    # Update manifest page count
    manifest_path = COURSES_DIR / course.id / "manifest.json"
    if manifest_path.exists():
        mf = json.loads(manifest_path.read_text(encoding="utf-8"))
        mf["wiki_page_count"] = len(list(wiki_dir.glob("*.md")))
        mf["built_at"] = datetime.date.today().isoformat()
        manifest_path.write_text(json.dumps(mf, indent=2), encoding="utf-8")

    logger.info("✅ %s: generated=%d  failed=%d", course.id, generated, len(failed))
    return {"course": course.id, "generated": generated,
            "skipped": len(existing), "failed": failed}


def main():
    ap = argparse.ArgumentParser(description="Gemini CLI-based course expander (free tier)")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true", help="Expand all courses")
    g.add_argument("--course-id", nargs="+", metavar="ID", help="Expand specific course(s)")
    ap.add_argument("--overwrite", action="store_true", help="Regenerate existing pages")
    ap.add_argument("--skip", nargs="+", metavar="ID", default=[], help="Course IDs to skip")
    ap.add_argument("--model", default=_GEN_MODEL,
                    choices=[CLI_MODEL_PRO, CLI_MODEL_FLASH],
                    help="Gemini model to use (default: gemini-2.5-pro)")
    args = ap.parse_args()

    # Verify CLI works
    logger.info("Checking Gemini CLI …")
    test = _call_cli("Reply with: OK", model=args.model, retries=1)
    if not test or "OK" not in test.upper():
        logger.error("Gemini CLI check failed. Make sure you are signed in: gemini auth login")
        logger.error("Got: %s", test)
        sys.exit(1)
    logger.info("✅ Gemini CLI ready (model: %s)", args.model)

    if args.all:
        courses = [c for c in ALL_COURSES if c.id not in args.skip]
    else:
        id_set = set(args.course_id)
        courses = [c for c in ALL_COURSES if c.id in id_set]

    if not courses:
        logger.error("No matching courses found. Valid IDs: %s",
                     [c.id for c in ALL_COURSES])
        sys.exit(1)

    logger.info("Processing %d course(s) with model=%s", len(courses), args.model)

    results = []
    for course in courses:
        result = process_course(course, overwrite=args.overwrite, model=args.model)
        results.append(result)

    print("\n" + "=" * 60)
    print("CLI EXPANSION RESULTS:")
    total_gen = total_fail = 0
    for r in results:
        total_gen  += r["generated"]
        total_fail += len(r["failed"])
        status = "✅" if not r["failed"] else "⚠️"
        print(f"  {status} {r['course']}: +{r['generated']} pages  "
              f"(skipped={r['skipped']}, failed={len(r['failed'])})")
        if r["failed"]:
            print(f"     Failed slugs: {r['failed']}")
    print(f"\nTOTAL: +{total_gen} pages generated, {total_fail} failures")
    print("=" * 60)


if __name__ == "__main__":
    main()
