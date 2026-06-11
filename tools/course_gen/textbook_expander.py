#!/usr/bin/env python3
"""
Textbook Expander — upgrades Student AI courses to full textbook depth.

Strategy:
  1. Loads per-course topic list from textbook_syllabi/<course-id>.json
  2. Skips pages that already exist (incremental)
  3. Generates each page with the TEXTBOOK_FORMAT prompt (2500+ words, deep sections)
  4. Injects YAML frontmatter + GIF strategy A/C

Usage:
    python tools/course_gen/textbook_expander.py --all
    python tools/course_gen/textbook_expander.py --course-id algorithms
    python tools/course_gen/textbook_expander.py --course-id algorithms --overwrite
"""
from __future__ import annotations

import argparse
import datetime
import json
import logging
import re
import sys
import time
import tempfile
from pathlib import Path
from typing import List, Optional

_THIS_DIR  = Path(__file__).parent.resolve()
_REPO_ROOT = _THIS_DIR.parent.parent.resolve()
sys.path.insert(0, str(_THIS_DIR))

from gemini_build_courses import ALL_COURSES, CourseSpec
from direct_api_generator import _call_api, _get_client, MODEL_FLASH, MODEL_FLASH_FB, API_KEY, COURSES_DIR

# Use the full Flash model for richer 2500+ word output
_GEN_MODEL = MODEL_FLASH_FB

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s \u00f9 %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("textbook_exp")

SYLLABI_DIR = _THIS_DIR / "textbook_syllabi"
SYLLABI_DIR.mkdir(exist_ok=True)

# ── Textbook page format ───────────────────────────────────────────────────────
TEXTBOOK_FORMAT = """
You are writing a CHAPTER in a world-class university textbook — the kind used at MIT, Stanford, CMU.
This single page must be comprehensive enough that a student needs NO other resource for this topic.

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
has_quiz: true
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
- **[Company/System]**: ...
- **[Domain]**: Real-world systems that depend on this (operating systems, databases, compilers, etc.)

(Minimum 4 detailed real-world applications with specific company/system names)

## 11. Practice Problems

### 🟢 Easy
1. **[Problem title]**: [Full problem statement with constraints]
   *Hint: [Specific, useful hint]*
   *Expected complexity: O(...)*

### 🟡 Medium
2. **[Problem title]**: [Full problem statement]
   *Hint: [Hint]*
   *Expected complexity: O(...)*

3. **[Problem title]**: [Full problem statement]
   *Hint: [Hint]*

### 🔴 Hard
4. **[Problem title]**: [Full problem statement — challenging, interview-level]
   *Hint: [Hint]*
   *Expected complexity: O(...)*

5. **[LeetCode/Codeforces-style problem]**: [Problem with constraints typical of competitive programming]

## 12. Interactive Quiz
:::quiz
**Q1:** [Core concept MCQ — tests fundamental understanding]
- A) [Wrong — common misconception]
- B) [Correct]
- C) [Wrong]
- D) [Wrong]
> B — [Thorough explanation: why B is right, why others are wrong, common trap]

**Q2:** [Complexity/analysis MCQ — tests ability to analyze]
- A) ...
- B) ...
- C) ...
- D) ...
> [X] — [Explanation with derivation]

**Q3:** [Code output/trace MCQ — tests implementation understanding]
- A) ...
- B) ...
- C) ...
- D) ...
> [X] — [Trace through the code step by step]

**Q4:** [Application/design MCQ — tests deeper judgment]
- A) ...
- B) ...
- C) ...
- D) ...
> [X] — [Explanation]

**Q5:** [Advanced/tricky MCQ — differentiates top students]
- A) ...
- B) ...
- C) ...
- D) ...
> [X] — [Explanation]
:::

## 13. Interview Preparation

### Conceptual Questions
**Q: Explain [topic] as if teaching it to a fellow engineer.**
*A: [4-5 sentence structured answer. Lead with a one-liner definition. Build up complexity. End with insight.]*

**Q: What are the time and space complexities? Derive them.**
*A: [Full derivation with recurrence or argument. Don't just state the answer.]*

**Q: How would you choose between [this] and [alternative] in a real system?**
*A: [Practical engineering answer: consider dataset size, memory constraints, cache behavior, etc.]*

**Q: [Classic follow-up: "What if the input has X property?", "Can you optimize?", "What breaks if..."]*
*A: [Detailed response demonstrating deep understanding]*

**Q: [System design question involving this concept]**
*A: [Structured think-aloud: clarify requirements → high-level design → component using this concept → trade-offs]*

**Q: [Behavioral/experience question: "Tell me about a time you used X"]*
*A: [STAR-format template answer a student can adapt]*

### Quick Reference (Cheat Sheet)
| Property | Value |
|---|---|
| Time Complexity | O(...) |
| Space Complexity | O(...) |
| Stable? | Yes/No |
| In-place? | Yes/No |
| [Other key property] | ... |

## 14. Key Takeaways
1. [Most important concept — the core insight]
2. [Critical complexity result or mathematical fact]
3. [Practical engineering insight]
4. [Common mistake to avoid]
5. [Connection to broader field]
6. [Interview tip]
7. [When to use this vs alternatives]

## 15. Common Misconceptions
- ❌ **[Wrong belief]** → ✅ **[Correct understanding with brief explanation]**
- ❌ **[Wrong belief]** → ✅ **[Correct understanding]**
- ❌ **[Wrong belief]** → ✅ **[Correct understanding]**

## 16. Further Reading
- *[Textbook name, Author, Chapter X]* — [What to read there]
- *[CLRS/SICP/Dragon Book/etc.]* — [Specific section]
- [Online resource] — [What it covers]
- [Original paper/seminal work] — [Why it's worth reading]

## 17. Related Topics
- [[<slug>]] — [How it relates]
- [[<slug>]] — [How it relates]
- [[<slug>]] — [How it relates]
- [[<slug>]] — [How it relates]
```
"""

_PAGE_SYSTEM_TEXTBOOK = """You are a world-class professor writing a university textbook chapter.
Your audience: undergraduate/graduate students at top universities preparing for technical roles at FAANG/top companies.
Standard: MIT OpenCourseWare + CLRS + real industry experience combined.
Every section must be substantive — no filler, no hand-waving.
Minimum 2500 words of prose (not counting code blocks).
This page must be a COMPLETE standalone reference — the reader needs nothing else."""


def generate_textbook_page(course: CourseSpec, slug: str, title: str, context_topics: List[str]) -> Optional[str]:
    """Generate a deep textbook-quality wiki page."""
    related = ", ".join(f"[[{t}]]" for t in context_topics[:8] if t != slug)
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
- :::quiz block: exactly 5 MCQs with > X — explanation format
- All 17 sections above must be present and fully populated
- Minimum 2500 words of prose content
- Cross-references use [[slug]] format

Generate the complete chapter now (start directly with the YAML frontmatter ---):"""

    return _call_api(prompt, _GEN_MODEL)


def process_course(course: CourseSpec, overwrite: bool = False) -> dict:
    """Process one course: load syllabus, generate missing pages."""
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
    # Skip index — handled separately
    to_generate = [t for t in to_generate if t["slug"] != "index"]

    logger.info("━" * 60)
    logger.info("  %s: %d total topics, %d to generate", course.title, len(topics), len(to_generate))
    logger.info("━" * 60)

    generated, failed = 0, []

    for i, topic in enumerate(to_generate):
        slug, title = topic["slug"], topic["title"]
        logger.info("[%d/%d] %s / %s", i + 1, len(to_generate), course.id, slug)

        content = generate_textbook_page(course, slug, title, all_slugs)
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

        time.sleep(5)

    # Update manifest page count
    manifest_path = COURSES_DIR / course.id / "manifest.json"
    if manifest_path.exists():
        mf = json.loads(manifest_path.read_text(encoding="utf-8"))
        mf["wiki_page_count"] = len(list(wiki_dir.glob("*.md")))
        mf["built_at"] = datetime.date.today().isoformat()
        manifest_path.write_text(json.dumps(mf, indent=2), encoding="utf-8")

    logger.info("✅ %s: generated=%d  failed=%d", course.id, generated, len(failed))
    return {"course": course.id, "generated": generated, "skipped": len(existing), "failed": failed}


def main():
    ap = argparse.ArgumentParser(description="Textbook-quality course expander")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true")
    g.add_argument("--course-id", nargs="+", metavar="ID")
    ap.add_argument("--overwrite", action="store_true", help="Regenerate existing pages")
    ap.add_argument("--skip", nargs="+", metavar="ID", default=[])
    args = ap.parse_args()

    # Verify API
    try:
        client = _get_client()
        import google.genai as genai
        r = client.models.generate_content(model=_GEN_MODEL, contents="Reply OK")
        logger.info("✅ API ready (%s)", _GEN_MODEL)
    except Exception as e:
        logger.error("API check failed: %s", e)
        sys.exit(1)

    if args.all:
        courses = [c for c in ALL_COURSES if c.id not in args.skip]
    else:
        courses = [c for c in ALL_COURSES if c.id in args.course_id]

    if not courses:
        logger.error("No matching courses found")
        sys.exit(1)

    results = []
    for course in courses:
        result = process_course(course, overwrite=args.overwrite)
        results.append(result)

    print("\n" + "=" * 60)
    print("TEXTBOOK EXPANSION RESULTS:")
    total_gen = total_fail = 0
    for r in results:
        fails = f"  ⚠ {r['failed']}" if r["failed"] else ""
        print(f"  {r['course']:<35} generated={r['generated']}{fails}")
        total_gen += r["generated"]
        total_fail += len(r["failed"])
    print(f"  {'TOTAL':<35} generated={total_gen}  failed={total_fail}")
    print("=" * 60)


if __name__ == "__main__":
    main()
