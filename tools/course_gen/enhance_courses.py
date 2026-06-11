#!/usr/bin/env python3
"""
Course Enhancement Pass
========================
Upgrades existing wiki pages by:
  1. Adding YAML frontmatter (course, topic, tags, difficulty) — for RAG/LLM context
  2. Injecting GIF animations (real Wikimedia URLs)
  3. Injecting :::demo interactive HTML/JS visualizations
  4. Injecting ```mermaid diagrams
    5. Full-rewriting pages that are too thin (<450 words) or missing 3+ elements

Designed for LLM/RAG consumption:
  - Frontmatter enables metadata-based filtering
  - Rich section structure enables semantic chunking
  - No broken external dependencies in the markdown text

Usage:
    python tools/course_gen/enhance_courses.py --all
    python tools/course_gen/enhance_courses.py --course-id algorithms
    python tools/course_gen/enhance_courses.py --all --min-missing 2
"""
from __future__ import annotations

import argparse
import json
import logging
import re
import sys
import time
from pathlib import Path
from typing import List, Optional

_THIS_DIR  = Path(__file__).parent.resolve()
_REPO_ROOT = _THIS_DIR.parent.parent.resolve()
sys.path.insert(0, str(_THIS_DIR))

from gemini_build_courses import ALL_COURSES, CourseSpec, _PAGE_FORMAT
from direct_api_generator  import (
    COURSES_DIR, API_KEY, MODEL_PRO, MODEL_FLASH, MODEL_FLASH_FB,
    _call_api, get_client, generate_page,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("enhancer")

COURSES_BY_ID = {c.id: c for c in ALL_COURSES}

# ── Quality checks ────────────────────────────────────────────────────────────

def _audit(content: str) -> dict:
    words       = len(content.split())
    has_gif     = bool(re.search(r"!\[.*?\]\(.*?\.gif\)", content, re.IGNORECASE)
                       or "upload.wikimedia.org" in content)
    has_demo    = ":::demo" in content
    has_mermaid = "```mermaid" in content
    has_fm      = content.startswith("---")
    missing = []
    if not has_gif:     missing.append("gif")
    if not has_demo:    missing.append("demo")
    if not has_mermaid: missing.append("mermaid")
    return {
        "words": words, "has_gif": has_gif, "has_demo": has_demo,
        "has_mermaid": has_mermaid,
        "has_frontmatter": has_fm, "missing": missing,
    }


def _needs_enhancement(audit: dict, min_missing: int = 2) -> bool:
    return len(audit["missing"]) >= min_missing or audit["words"] < 450


# ── Frontmatter ───────────────────────────────────────────────────────────────

def _make_frontmatter(course: CourseSpec, slug: str, title: str, audit: dict) -> str:
    return f"""---
course: "{course.id}"
course_title: "{course.title}"
topic: "{slug}"
title: "{title}"
difficulty: "{course.difficulty}"
tags: [{', '.join(f'"{t}"' for t in course.tags[:6])}]
placement_domains: [{', '.join(f'"{d}"' for d in course.placement_domains[:3])}]
has_interactive: {"true" if not audit["missing"] else "false"}
has_quiz: false
has_code: true
rag_indexed: true
---

"""


# ── Injection prompts ─────────────────────────────────────────────────────────

_GIF_PROMPT = """\
For the topic "{title}" in a {course} course, generate ONLY a markdown image block with a real animated GIF from Wikimedia Commons.

Format:
## Visual Intuition
![Brief alt text describing what the animation shows](https://upload.wikimedia.org/wikipedia/commons/PATH/TO/FILE.gif)
*Caption: one sentence explaining what the animation demonstrates.*

Rules:
- Use a REAL URL from upload.wikimedia.org that actually exists for this topic
- Choose a GIF (not a PNG/SVG) — animation is required
- The image must directly illustrate the core concept of the topic
- Output ONLY the section (starting with ## Visual Intuition), nothing else

Examples of real Wikimedia GIF paths:
- Sorting: /4/46/Merge_sort_algorithm_diagram.svg (use .gif equivalents)
- Trees: /2/23/AVLtreef.gif
- NN: /0/07/Gradient_descent.gif  
- OS scheduler: use a relevant process scheduling animation
- Graph BFS: /5/5d/Breadth-First-Search-Algorithm.gif
"""

_DEMO_PROMPT = """\
For the topic "{title}" in a {course} course, generate ONLY a self-contained interactive HTML/JS demo block.

Format:
## Interactive Demo
:::demo
<!-- title: {title} Visualizer -->
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{ margin:0; background:#0f1117; color:#e5e7eb; font-family:system-ui,sans-serif; font-size:13px; padding:12px; }}
  /* all CSS inline */
</style>
</head>
<body>
  <!-- fully self-contained, NO external libraries, animates the core concept -->
  <!-- controls: play/pause/step/reset buttons as appropriate -->
<script>
  // all JS inline, requestAnimationFrame for smooth animation
</script>
</body>
</html>
:::

The demo must:
- Animate the CORE CONCEPT of "{title}" (not a generic placeholder)
- Be 100% self-contained vanilla HTML/CSS/JS
- Have clear controls (at minimum a Start/Reset button)
- Work in a sandboxed iframe (no external fetches)
- Show data changing step by step if it's an algorithm
Output ONLY the section starting with ## Interactive Demo, nothing else.
"""

_MERMAID_PROMPT = """\
For the topic "{title}" in a {course} course, generate ONLY a mermaid diagram block.

Format:
## Visual Diagram
```mermaid
(valid mermaid diagram — flowchart TD, graph LR, sequenceDiagram, stateDiagram-v2, classDiagram, or gantt as appropriate)
```
*Caption: one sentence explaining what the diagram shows.*

Rules:
- Choose the diagram TYPE that best fits the concept (flowchart for processes/algorithms, sequenceDiagram for protocols, classDiagram for OOP, stateDiagram for FSMs)
- Make it substantial (at least 8-12 nodes/steps)
- Use proper mermaid v10 syntax — NO unsupported features
- Caption must explain the diagram's key insight
Output ONLY the section starting with ## Visual Diagram, nothing else.
"""

def _generate_section(prompt_template: str, course: CourseSpec, slug: str, title: str) -> Optional[str]:
    prompt = prompt_template.format(
        title=title, course=course.title, slug=slug
    )
    return _call_api(prompt, MODEL_FLASH)


# ── Full page rewrite for thin pages ─────────────────────────────────────────

def _full_rewrite(course: CourseSpec, slug: str, title: str, old_content: str) -> Optional[str]:
    """Full rewrite keeping any good existing text as context."""
    prompt = f"""You are an expert professor. Rewrite and significantly enhance this wiki page.

**Course:** {course.title}
**Topic:** {title}
**Slug:** {slug}
**Placement targets:** {', '.join(course.placement_domains)}
**Code language:** {course.code_lang}

EXISTING CONTENT (keep the core facts, but expand significantly):
---
{old_content[:2000]}
---

{_PAGE_FORMAT}

Requirements:
- Minimum 900 words of actual content (not counting code)
- Keep all correct facts from the existing content
- Title: # {title}
- Add real Wikimedia GIF, :::demo block, and mermaid diagram
- Add an interview-prep section with at least 8 questions only (no answers)
- LaTeX math where applicable
- Complete, runnable {course.code_lang} code example

Generate the complete enhanced page (start directly with # {title}):"""
    return _call_api(prompt, MODEL_FLASH)


# ── Page enhancer ─────────────────────────────────────────────────────────────

def enhance_page(page_path: Path, course: CourseSpec, slug: str) -> bool:
    """Enhance a single page in-place. Returns True if modified."""
    content  = page_path.read_text(encoding="utf-8", errors="replace")
    audit    = _audit(content)
    title_m  = re.match(r"^#\s+(.+)", content.lstrip("---\n").lstrip(), re.MULTILINE)
    title    = title_m.group(1) if title_m else slug.replace("-", " ").title()

    # Skip index/log files
    if slug in ("index", "log") or audit["words"] < 20:
        return False

    if not _needs_enhancement(audit, min_missing=2):
        # Only add frontmatter if missing
        if not audit["has_frontmatter"]:
            fm = _make_frontmatter(course, slug, title, audit)
            page_path.write_text(fm + content, encoding="utf-8")
            return True
        return False

    logger.info("  Enhancing %s.md  (words=%d missing=%s)",
                slug, audit["words"], audit["missing"])

    # Full rewrite for very thin pages
    if audit["words"] < 450 or len(audit["missing"]) >= 4:
        logger.info("    → Full rewrite (thin/bare page)")
        new_content = _full_rewrite(course, slug, title, content)
        if new_content:
            if not new_content.startswith("---"):
                fm = _make_frontmatter(course, slug, title, _audit(new_content))
                new_content = fm + new_content
            page_path.write_text(new_content, encoding="utf-8")
            logger.info("    written %d chars", len(new_content))
            return True
        return False

    # Injection pass — add only the missing elements
    additions = []

    if "gif" in audit["missing"]:
        section = _generate_section(_GIF_PROMPT, course, slug, title)
        if section:
            additions.append(("gif", section))

    if "mermaid" in audit["missing"]:
        section = _generate_section(_MERMAID_PROMPT, course, slug, title)
        if section:
            additions.append(("mermaid", section))

    if "demo" in audit["missing"]:
        section = _generate_section(_DEMO_PROMPT, course, slug, title)
        if section:
            additions.append(("demo", section))

    if not additions:
        return False

    # Inject additions before "## Related Topics" / "## Common Exam" or at end
    injection = "\n\n" + "\n\n".join(sec for _, sec in additions)
    insert_before = re.search(r"\n## (Related Topics|Common Exam|References|See Also)", content)
    if insert_before:
        pos = insert_before.start()
        content = content[:pos] + injection + "\n\n" + content[pos:]
    else:
        content = content + injection

    # Add frontmatter
    if not content.startswith("---"):
        updated_audit = _audit(content)
        fm = _make_frontmatter(course, slug, title, updated_audit)
        content = fm + content

    page_path.write_text(content, encoding="utf-8")
    logger.info("    injected: %s", ", ".join(k for k, _ in additions))
    return True


# ── Course enhancer ───────────────────────────────────────────────────────────

def enhance_course(course: CourseSpec, min_missing: int = 2) -> dict:
    wiki_dir = COURSES_DIR / course.id / "wiki"
    if not wiki_dir.exists():
        logger.warning("No wiki dir for %s", course.id)
        return {"enhanced": 0, "skipped": 0}

    pages = sorted(wiki_dir.glob("*.md"))
    logger.info("")
    logger.info("=" * 60)
    logger.info("  Enhancing: %s  (%d pages)", course.title, len(pages))
    logger.info("=" * 60)

    enhanced = skipped = 0
    for page in pages:
        slug = page.stem
        if slug in ("index", "log"):
            # Just add frontmatter to index pages
            content = page.read_text(encoding="utf-8", errors="replace")
            if not content.startswith("---"):
                audit = _audit(content)
                title_m = re.match(r"^#\s+(.+)", content, re.MULTILINE)
                title = title_m.group(1) if title_m else slug.replace("-", " ").title()
                fm = _make_frontmatter(course, slug, title, audit)
                page.write_text(fm + content, encoding="utf-8")
            skipped += 1
            continue

        modified = enhance_page(page, course, slug)
        if modified:
            enhanced += 1
        else:
            skipped += 1

    logger.info("  Done: enhanced=%d  skipped=%d", enhanced, skipped)
    return {"enhanced": enhanced, "skipped": skipped}


# ── Main ──────────────────────────────────────────────────────────────────────

ALL_COURSE_IDS = [c.id for c in ALL_COURSES]

def main():
    parser = argparse.ArgumentParser(
        description="Enhance existing course wiki pages with GIFs, demos, mermaid, and RAG frontmatter."
    )
    parser.add_argument("--all",          action="store_true")
    parser.add_argument("--course-id",    nargs="+", help="One or more course IDs to enhance")
    parser.add_argument("--skip",         nargs="+", default=[])
    parser.add_argument("--min-missing",  type=int, default=2,
                        help="Min missing elements to trigger enhancement (default: 2)")
    args = parser.parse_args()

    # Quick connectivity check
    logger.info("Checking API …")
    if not _call_api("Respond: ok", MODEL_FLASH, retries=2):
        logger.error("API not available")
        sys.exit(1)
    logger.info("API ready")

    skip = set(args.skip)
    results = {}

    if args.course_id:
        for cid in args.course_id:
            course = COURSES_BY_ID.get(cid)
            if not course:
                logger.error("Unknown course: %s", cid)
                continue
            results[cid] = enhance_course(course, args.min_missing)
            time.sleep(5)

    elif args.all:
        for cid in ALL_COURSE_IDS:
            if cid in skip:
                logger.info("Skipping %s", cid)
                continue
            course = COURSES_BY_ID.get(cid)
            if not course:
                continue
            results[cid] = enhance_course(course, args.min_missing)
            time.sleep(5)

    else:
        parser.print_help()
        sys.exit(0)

    print("\n" + "=" * 55)
    print("ENHANCEMENT RESULTS:")
    total_enhanced = total_skipped = 0
    for cid, r in results.items():
        e, s = r.get("enhanced", 0), r.get("skipped", 0)
        total_enhanced += e
        total_skipped  += s
        print(f"  {cid:<40}  enhanced={e}  skipped={s}")
    print(f"  {'TOTAL':<40}  enhanced={total_enhanced}  skipped={total_skipped}")
    print("=" * 55)


if __name__ == "__main__":
    main()
