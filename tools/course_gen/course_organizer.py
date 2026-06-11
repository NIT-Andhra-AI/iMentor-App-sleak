#!/usr/bin/env python3
"""
course_organizer.py — Gemini CLI-driven course audit, update, and organization

Run this from the project root. It scans every course in assets/courses/,
audits each wiki page for quality, regenerates thin/broken pages via the
Gemini CLI, and then rebuilds every manifest.json so module structure
matches what is on disk.

Usage
-----
    # Audit all courses (no writes — just report)
    python tools/course_gen/course_organizer.py --audit

    # Expand thin pages in one course (< min_words words)
    python tools/course_gen/course_organizer.py --course-id algorithms

    # Expand thin pages in ALL courses
    python tools/course_gen/course_organizer.py --all

    # Force-rewrite every page regardless of quality
    python tools/course_gen/course_organizer.py --all --overwrite

    # Only rebuild manifests (no LLM calls)
    python tools/course_gen/course_organizer.py --rebuild-manifests

    # Change minimum word threshold (default: 600)
    python tools/course_gen/course_organizer.py --all --min-words 800

Gemini CLI must be available on PATH or under ~/.bun/bin/gemini.
Install: bun add -g @google/gemini-cli
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from pathlib import Path
from typing import List, Optional

# ── Path setup ────────────────────────────────────────────────────────────────
_THIS_DIR  = Path(__file__).parent.resolve()
_REPO_ROOT = _THIS_DIR.parent.parent.resolve()
sys.path.insert(0, str(_THIS_DIR))
sys.path.insert(0, str(_REPO_ROOT / "server"))

# Batch rewrites are long; prefer faster model unless user overrides.
os.environ.setdefault("GEMINI_MODEL", "gemini-2.5-flash")

from gemini_client import generate as _gemini_generate  # type: ignore

COURSES_DIR = _REPO_ROOT / "assets" / "courses"
SYLLABI_DIR = _THIS_DIR / "textbook_syllabi"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("organizer")


# ── Quality audit ─────────────────────────────────────────────────────────────

def audit_page(content: str) -> dict:
    words       = len(content.split())
    has_gif     = bool(re.search(r"!\[.*?\]\(.*?\.gif\)", content, re.IGNORECASE)
                       or "upload.wikimedia.org" in content)
    has_mermaid = "```mermaid" in content
    has_demo    = ":::demo" in content
    has_fm      = content.strip().startswith("---")
    has_code    = "```" in content
    missing = []
    if not has_gif:     missing.append("gif")
    if not has_mermaid: missing.append("mermaid")
    if not has_demo:    missing.append("demo")
    if not has_code:    missing.append("code")
    if not has_fm:      missing.append("frontmatter")
    return {
        "words": words,
        "has_gif": has_gif, "has_mermaid": has_mermaid,
        "has_demo": has_demo, "has_code": has_code,
        "has_frontmatter": has_fm,
        "missing": missing,
    }


def needs_work(audit: dict, min_words: int) -> bool:
    return audit["words"] < min_words or len(audit["missing"]) >= 2


# ── Frontmatter helpers ───────────────────────────────────────────────────────

def extract_fm_title(content: str, slug: str) -> str:
    fm = re.search(r"^---\s*\n(.*?)\n---", content, re.DOTALL)
    if fm:
        tm = re.search(r"^title:\s*[\"']?(.+?)[\"']?\s*$", fm.group(1), re.MULTILINE)
        if tm:
            return tm.group(1).strip()
    h1 = re.search(r"(?m)^#\s+(.+)$", content)
    if h1:
        return h1.group(1).strip()
    return " ".join(w.capitalize() for w in slug.replace("-", " ").split())


# ── Page type / icon classifiers ──────────────────────────────────────────────

def classify_page(slug: str) -> str:
    s = slug.lower()
    if s in ("index", "overview"):               return "overview"
    if "interview" in s or "placement" in s:     return "interview"
    if "quiz" in s or "practice" in s:           return "quiz"
    if "lab" in s or "coding" in s:              return "lab"
    if "project" in s:                           return "project"
    return "concept"


PAGE_ICONS = {
    "overview": "🗺️", "interview": "💼", "quiz": "📝",
    "lab": "🧪",      "project": "🚀",   "concept": "📄",
}


# ── Manifest rebuilder ────────────────────────────────────────────────────────

def rebuild_manifest(course_id: str) -> bool:
    """
    Rebuild manifest.json for a course by scanning the wiki/ directory.
    Groups pages into modules using the textbook syllabus if available,
    otherwise groups by type.  Returns True if written successfully.
    """
    course_dir  = COURSES_DIR / course_id
    wiki_dir    = course_dir / "wiki"
    manifest_f  = course_dir / "manifest.json"

    if not wiki_dir.exists():
        logger.warning("  ⚠  %s: no wiki/ directory — skipping", course_id)
        return False

    # All .md pages on disk (excluding index.md)
    disk_pages = {p.stem: p for p in sorted(wiki_dir.glob("*.md")) if p.stem != "index"}
    if not disk_pages:
        logger.warning("  ⚠  %s: no markdown pages found", course_id)
        return False

    # Preserve metadata from existing manifest
    old: dict = {}
    if manifest_f.exists():
        try:
            old = json.loads(manifest_f.read_text(encoding="utf-8"))
        except Exception:
            pass

    # Try to load textbook syllabus for ordered sections
    syllabus_sections: dict[str, list[str]] = {}   # section → [slug, ...]
    sections_order: list[str] = []
    syllabus_f = SYLLABI_DIR / f"{course_id}.json"
    if syllabus_f.exists():
        try:
            syl = json.loads(syllabus_f.read_text(encoding="utf-8"))
            topics: list = syl if isinstance(syl, list) else syl.get("topics", [])
            for t in topics:
                sec = t.get("section", "Core Lectures")
                slug = t.get("slug", "")
                if not slug:
                    continue
                if sec not in syllabus_sections:
                    syllabus_sections[sec] = []
                    sections_order.append(sec)
                syllabus_sections[sec].append(slug)
        except Exception:
            pass

    # Build modules
    modules: list[dict] = []

    # Always put overview/index first
    getting_started_slugs = [s for s in ("overview", "index") if s in disk_pages]
    if getting_started_slugs:
        modules.append({
            "id":          "getting-started",
            "title":       "Getting Started",
            "description": f"Introduction and overview of {old.get('title', course_id)}",
            "icon":        "🎓",
            "pages": [
                {
                    "slug":  slug,
                    "title": extract_fm_title(disk_pages[slug].read_text(encoding="utf-8",
                                                                          errors="replace"), slug),
                    "type":  classify_page(slug),
                }
                for slug in getting_started_slugs
            ],
        })

    covered: set[str] = set(getting_started_slugs)

    # Syllabus-driven modules
    if syllabus_sections:
        for section in sections_order:
            slugs_in_section = [
                s for s in syllabus_sections[section]
                if s in disk_pages and s not in covered
            ]
            if not slugs_in_section:
                continue
            mod_id = re.sub(r"[^\w]+", "-", section.lower()).strip("-")
            modules.append({
                "id":          mod_id,
                "title":       section,
                "description": f"{section} topics for {old.get('title', course_id)}",
                "icon":        "📘",
                "pages": [
                    {
                        "slug":  slug,
                        "title": extract_fm_title(
                            disk_pages[slug].read_text(encoding="utf-8", errors="replace"), slug),
                        "type":  classify_page(slug),
                    }
                    for slug in slugs_in_section
                ],
            })
            covered.update(slugs_in_section)

    # Remaining pages not in any syllabus section
    remaining = [s for s in disk_pages if s not in covered]
    # Group remaining by type
    type_groups: dict[str, list[str]] = {}
    for slug in remaining:
        pt = classify_page(slug)
        type_groups.setdefault(pt, []).append(slug)

    type_titles = {
        "concept":   ("Core Lectures",     "📘"),
        "overview":  ("Overview",          "🗺️"),
        "interview": ("Interview Prep",     "💼"),
        "quiz":      ("Practice & Quizzes","📝"),
        "lab":       ("Labs & Coding",      "🧪"),
        "project":   ("Projects",           "🚀"),
    }
    for pt, (title, icon) in type_titles.items():
        slugs = sorted(type_groups.get(pt, []))
        if not slugs:
            continue
        mod_id = pt.replace(" ", "-")
        modules.append({
            "id":          mod_id,
            "title":       title,
            "description": f"{title} for {old.get('title', course_id)}",
            "icon":        icon,
            "pages": [
                {
                    "slug":  slug,
                    "title": extract_fm_title(
                        disk_pages[slug].read_text(encoding="utf-8", errors="replace"), slug),
                    "type":  pt,
                }
                for slug in slugs
            ],
        })

    total_pages = sum(len(m["pages"]) for m in modules)

    manifest = {
        "id":              course_id,
        "title":           old.get("title", " ".join(w.capitalize() for w in
                                                       course_id.replace("-", " ").split())),
        "version":         old.get("version", "1.0.0"),
        "description":     old.get("description", ""),
        "placement_domains": old.get("placement_domains", []),
        "wiki_page_count": total_pages,
        "module_count":    len(modules),
        "built_with":      old.get("built_with", "course_organizer"),
        "built_at":        old.get("built_at", ""),
        "tags":            old.get("tags", []),
        "modules":         modules,
    }

    manifest_f.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    logger.info("  ✓  %s: manifest written (%d pages, %d modules)",
                course_id, total_pages, len(modules))
    return True


# ── Page generation prompt ────────────────────────────────────────────────────

_PAGE_SYSTEM = """\
You are a world-class professor writing a university textbook chapter for
undergraduate/graduate BTech students preparing for technical roles at
FAANG/top companies.  Standard: MIT OCW + CLRS + real industry experience.
Minimum 2500 words of prose (not counting code blocks).
This page must be a COMPLETE standalone reference — the reader needs nothing else.
"""

_PAGE_FORMAT = """\
REQUIRED FORMAT — every section must be present, fully populated, no placeholders:

```
---
course: {course_id}
topic: {slug}
title: {Full Topic Title}
difficulty: intermediate
tags: [tag1, tag2, tag3, tag4, tag5]
placement_domains: [Domain1, Domain2]
has_interactive: true
has_quiz: true
has_code: true
has_gif: true
---

# {Full Topic Title}

> **One-sentence definition** — precise, memorable, technically correct.

## 1. Historical Background & Motivation
(2+ paragraphs — who invented it, when, what problem it solved, modern relevance)

## 2. Visual Intuition
(Include a real Wikimedia GIF animation — use format:
 ![Animation description](https://upload.wikimedia.org/wikipedia/commons/...)
 *Caption explaining the visualization*)

## 3. Core Theory & Mathematical Foundations
(Rigorous definitions, Big-O if relevant, LaTeX math in $$ ... $$ blocks)

## 4. Step-by-Step Worked Example
(Trace through a non-trivial example step by step)

## 5. Implementation
(Complete, runnable code in Python or C++ with inline comments)

```mermaid
(Architecture / flow diagram)
```

## 6. Industry Applications
(3+ real companies / systems using this concept, with explanation)

## 7. Practice Problems
- Easy: ...
- Medium: ...
- Hard: ...

## 8. Interview Preparation
(5 Q&A pairs, FAANG-level depth)

## 9. Key Takeaways
- ...

## 10. Common Misconceptions
- ...

:::demo
<!-- Optional: Self-contained HTML/CSS/JS interactive visualization, no CDN -->
<div id="viz">...</div>
<script>...</script>
:::
```
"""


def generate_page(course_id: str, slug: str, existing_content: str = "") -> Optional[str]:
    """Call Gemini CLI to generate or improve a wiki page."""
    topic_title = " ".join(w.capitalize() for w in slug.replace("-", " ").split())

    if existing_content.strip():
        prompt = (
            f"IMPROVE the following wiki page for the '{course_id}' course, topic '{slug}'.\n"
            f"The page is too thin or missing elements.  Rewrite it to be comprehensive.\n\n"
            f"EXISTING CONTENT:\n{existing_content[:3000]}\n\n"
            f"REQUIREMENTS:\n" + _PAGE_FORMAT.format(
                course_id=course_id, slug=slug,
                **{"Full Topic Title": topic_title}
            )
        )
    else:
        prompt = (
            f"Write a new wiki page for the '{course_id}' course, topic '{slug}'.\n"
            f"Topic title: {topic_title}\n\n"
            f"REQUIREMENTS:\n" + _PAGE_FORMAT.format(
                course_id=course_id, slug=slug,
                **{"Full Topic Title": topic_title}
            )
        )

    # Large textbook-style prompts can exceed the default 360s timeout.
    return _gemini_generate(prompt, system=_PAGE_SYSTEM, timeout=1200)


def _clean_llm_output(text: str) -> str:
    """Strip code fences that wrap the entire output (LLM sometimes adds them)."""
    text = text.strip()
    # Remove outer ```markdown ... ``` or ``` ... ``` wrappers
    m = re.match(r"^```(?:markdown)?\s*\n(.*)\n```\s*$", text, re.DOTALL)
    if m:
        return m.group(1).strip()
    return text


# ── Course audit + expand runner ──────────────────────────────────────────────

def audit_course(course_id: str, min_words: int) -> list[dict]:
    """Return list of pages that need work."""
    wiki_dir = COURSES_DIR / course_id / "wiki"
    if not wiki_dir.exists():
        return []
    results = []
    for p in sorted(wiki_dir.glob("*.md")):
        content = p.read_text(encoding="utf-8", errors="replace")
        a = audit_page(content)
        results.append({"slug": p.stem, "path": p, **a,
                        "needs_work": needs_work(a, min_words)})
    return results


def expand_course(
    course_id: str,
    *,
    min_words: int = 600,
    overwrite: bool = False,
    delay: float = 4.0,
) -> None:
    pages = audit_course(course_id, min_words)
    if not pages:
        logger.warning("  ⚠  %s: no pages found", course_id)
        return

    to_update = [p for p in pages if overwrite or p["needs_work"]]
    logger.info(
        "  %s: %d/%d pages need work (min_words=%d, overwrite=%s)",
        course_id, len(to_update), len(pages), min_words, overwrite,
    )

    for i, page in enumerate(to_update, 1):
        slug    = page["slug"]
        path    = page["path"]
        existing = path.read_text(encoding="utf-8", errors="replace") if not overwrite else ""

        logger.info("  [%d/%d] Generating %s/%s …", i, len(to_update), course_id, slug)
        result = generate_page(course_id, slug, existing_content=existing)

        if not result:
            logger.warning("    ✗  Gemini returned nothing for %s — skipping", slug)
            continue

        cleaned = _clean_llm_output(result)

        # Basic sanity: must start with --- or # (frontmatter or heading)
        if not (cleaned.startswith("---") or cleaned.startswith("#")):
            logger.warning("    ✗  Output for %s looks malformed — skipping", slug)
            continue

        path.write_text(cleaned, encoding="utf-8")
        logger.info("    ✓  %s written (%d words)", slug, len(cleaned.split()))

        if i < len(to_update):
            time.sleep(delay)   # rate-limit courtesy pause

    # Rebuild manifest after expanding
    rebuild_manifest(course_id)


# ── CLI ───────────────────────────────────────────────────────────────────────

def _all_course_ids() -> list[str]:
    if not COURSES_DIR.exists():
        return []
    return sorted(
        d.name for d in COURSES_DIR.iterdir()
        if d.is_dir() and (d / "manifest.json").exists()
    )


def main() -> None:
    ap = argparse.ArgumentParser(
        description="Gemini CLI-powered course organizer for Student AI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument("--course-id",        help="Target a single course")
    ap.add_argument("--all",              action="store_true",
                    help="Process all courses")
    ap.add_argument("--audit",            action="store_true",
                    help="Only report quality — no writes")
    ap.add_argument("--rebuild-manifests",action="store_true",
                    help="Only rebuild manifests — no LLM calls")
    ap.add_argument("--overwrite",        action="store_true",
                    help="Rewrite every page regardless of quality")
    ap.add_argument("--min-words",        type=int, default=600,
                    help="Word count below which a page is rewritten (default: 600)")
    ap.add_argument("--skip",             nargs="*", default=[],
                    help="Course IDs to skip when using --all")
    ap.add_argument("--delay",            type=float, default=4.0,
                    help="Seconds between Gemini API calls (default: 4)")
    args = ap.parse_args()

    if not (args.course_id or args.all or args.audit or args.rebuild_manifests):
        ap.print_help()
        sys.exit(1)

    skip = set(args.skip or [])
    course_ids: list[str] = []
    if args.all or args.audit or args.rebuild_manifests:
        course_ids = [c for c in _all_course_ids() if c not in skip]
    elif args.course_id:
        course_ids = [args.course_id]

    if not course_ids:
        logger.error("No courses found under %s", COURSES_DIR)
        sys.exit(1)

    # ── audit only ────────────────────────────────────────────────────────────
    if args.audit:
        total_thin = 0
        for cid in course_ids:
            pages = audit_course(cid, args.min_words)
            thin = [p for p in pages if p["needs_work"]]
            total_thin += len(thin)
            print(f"\n{cid}  ({len(pages)} pages, {len(thin)} thin)")
            for p in thin:
                miss = ", ".join(p["missing"]) or "—"
                print(f"  {p['slug']:40s}  {p['words']:>5} words  missing: {miss}")
        print(f"\nTotal thin/missing pages: {total_thin}")
        return

    # ── manifests only ────────────────────────────────────────────────────────
    if args.rebuild_manifests:
        for cid in course_ids:
            logger.info("Rebuilding manifest: %s", cid)
            rebuild_manifest(cid)
        return

    # ── expand (LLM) ─────────────────────────────────────────────────────────
    for cid in course_ids:
        logger.info("Processing course: %s", cid)
        expand_course(
            cid,
            min_words=args.min_words,
            overwrite=args.overwrite,
            delay=args.delay,
        )

    logger.info("Done — %d course(s) processed.", len(course_ids))


if __name__ == "__main__":
    main()
