#!/usr/bin/env python3
"""
Page Rewriter — upgrades thin existing pages to textbook depth.

Finds pages under a word threshold and rewrites them using the textbook format.

Usage:
    python tools/course_gen/rewrite_thin_pages.py --all
    python tools/course_gen/rewrite_thin_pages.py --course-id algorithms
    python tools/course_gen/rewrite_thin_pages.py --threshold 1500  (default: 1200 words)
    python tools/course_gen/rewrite_thin_pages.py --list  (just list thin pages, no rewrite)
"""
from __future__ import annotations

import argparse
import datetime
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

from gemini_build_courses import ALL_COURSES, CourseSpec
from direct_api_generator import _call_api, _get_client, MODEL_FLASH, MODEL_FLASH_FB, COURSES_DIR

# Use the full Flash model for rewrites — it produces 2-3x more content than flash-lite
_REWRITE_MODEL = MODEL_FLASH_FB
from textbook_expander import TEXTBOOK_FORMAT, _PAGE_SYSTEM_TEXTBOOK

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s \u00f9 %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("rewriter")


def word_count(text: str) -> int:
    # Strip frontmatter and code blocks for word count
    text = re.sub(r"^---.*?---\s*", "", text, flags=re.DOTALL)
    text = re.sub(r"```.*?```", "", text, flags=re.DOTALL)
    text = re.sub(r":::.*?:::", "", text, flags=re.DOTALL)
    return len(text.split())


def find_thin_pages(course_id: str = None, threshold: int = 1200) -> List[dict]:
    """Return list of {course, slug, path, words} for pages under threshold."""
    thin = []
    courses_to_check = [c for c in ALL_COURSES if (not course_id or c.id == course_id)]
    for course in courses_to_check:
        wiki_dir = COURSES_DIR / course.id / "wiki"
        if not wiki_dir.exists():
            continue
        for page in sorted(wiki_dir.glob("*.md")):
            if page.stem in ("index",):
                continue
            text = page.read_text(encoding="utf-8", errors="ignore")
            wc = word_count(text)
            if wc < threshold:
                thin.append({
                    "course": course,
                    "slug": page.stem,
                    "path": page,
                    "words": wc,
                    "title": _extract_title(text, page.stem),
                })
    return thin


def _extract_title(text: str, slug: str) -> str:
    m = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
    return m.group(1).strip() if m else slug.replace("-", " ").title()


def rewrite_page(course: CourseSpec, slug: str, title: str, old_content: str, all_slugs: List[str]) -> Optional[str]:
    """Rewrite a thin page to textbook depth, preserving existing good content."""
    related = ", ".join(f"[[{s}]]" for s in all_slugs[:10] if s != slug)
    
    # Extract existing content worth preserving
    existing_preview = old_content[:2000] if len(old_content) > 500 else ""
    
    prompt = f"""{_PAGE_SYSTEM_TEXTBOOK}

REWRITE and EXPAND the following wiki page to full textbook chapter depth.
Preserve the core correct content but expand MASSIVELY — add missing sections, deepen explanations, add more examples.

**Course:** {course.title}
**Topic:** {title}
**Slug:** {slug}
**Target roles:** {', '.join(course.placement_domains)}
**Code language:** {course.code_lang}
**Other topics in this course:** {related}

EXISTING PAGE CONTENT (expand this — don't just copy it):
{existing_preview}

{TEXTBOOK_FORMAT}

REQUIREMENTS:
- Keep all correct technical content from existing page
- Add ALL missing sections from the format above
- Minimum 2500 words of prose
- Code in {course.code_lang} — complete, runnable
- 5 quiz questions in :::quiz block
- 6 interview Q&As
- 5 practice problems (Easy/Medium/Hard)
- All 17 sections present

Start with YAML frontmatter (---):"""

    return _call_api(prompt, _REWRITE_MODEL)


def main():
    ap = argparse.ArgumentParser()
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true")
    g.add_argument("--course-id", metavar="ID")
    g.add_argument("--list", action="store_true", help="List thin pages without rewriting")
    ap.add_argument("--threshold", type=int, default=1200, help="Word count threshold (default 1200)")
    ap.add_argument("--skip", nargs="+", metavar="ID", default=[])
    args = ap.parse_args()

    if args.list:
        thin = find_thin_pages(threshold=args.threshold)
        print(f"\n{'Course':<30} {'Slug':<40} {'Words':>6}")
        print("-" * 80)
        for p in sorted(thin, key=lambda x: x["words"]):
            print(f"{p['course'].id:<30} {p['slug']:<40} {p['words']:>6}")
        print(f"\nTotal thin pages (< {args.threshold} words): {len(thin)}")
        return

    # Verify API
    try:
        client = _get_client()
        r = client.models.generate_content(model=MODEL_FLASH, contents="Reply OK")
        logger.info("✅ API ready")
    except Exception as e:
        logger.error("API check failed: %s", e)
        sys.exit(1)

    cid = args.course_id if not args.all else None
    thin = find_thin_pages(course_id=cid, threshold=args.threshold)

    if args.skip:
        thin = [p for p in thin if p["course"].id not in args.skip]

    logger.info("Found %d thin pages (< %d words) to rewrite", len(thin), args.threshold)
    if not thin:
        logger.info("Nothing to rewrite!")
        return

    rewritten, failed = 0, []
    for i, page_info in enumerate(thin):
        course = page_info["course"]
        slug = page_info["slug"]
        title = page_info["title"]
        old_words = page_info["words"]
        path = page_info["path"]

        logger.info("[%d/%d] %s / %s (%d words → rewriting)",
                    i + 1, len(thin), course.id, slug, old_words)

        wiki_dir = COURSES_DIR / course.id / "wiki"
        all_slugs = [f.stem for f in wiki_dir.glob("*.md")]
        old_content = path.read_text(encoding="utf-8", errors="ignore")

        content = rewrite_page(course, slug, title, old_content, all_slugs)
        if content:
            if not content.strip().startswith("---"):
                fm = f"---\ncourse: {course.id}\ntopic: {slug}\ntitle: \"{title}\"\n---\n\n"
                content = fm + content
            new_wc = word_count(content)
            path.write_text(content, encoding="utf-8")
            rewritten += 1
            logger.info("  ✓ %d words (was %d)", new_wc, old_words)
        else:
            failed.append(f"{course.id}/{slug}")
            logger.warning("  ✗ Failed: %s/%s", course.id, slug)

        time.sleep(5)

    print(f"\n{'='*60}")
    print(f"REWRITE RESULTS: rewritten={rewritten}  failed={len(failed)}")
    if failed:
        print(f"Failed: {failed}")
    print("=" * 60)


if __name__ == "__main__":
    main()
