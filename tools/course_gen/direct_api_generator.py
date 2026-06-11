#!/usr/bin/env python3
"""
Direct Gemini API Course Generator
===================================
Bypasses the CLI OAuth quota entirely — uses google.genai Python SDK
with the provided API key (separate quota pool).

Model strategy:
  • gemini-2.5-pro   — manifest / index / topic-list generation (high quality)
  • gemini-2.5-flash — all wiki pages (fast, 1500 req/day free tier)

Rate limits (free tier AI Studio):
  • Pro:   5 RPM  → min 12s between calls
  • Flash: 15 RPM → min 4s between calls

Usage:
    python tools/course_gen/direct_api_generator.py --all
    python tools/course_gen/direct_api_generator.py --course-id dsa-placement
    python tools/course_gen/direct_api_generator.py --course-id quantum-computing
    python tools/course_gen/direct_api_generator.py --all --skip artificial-intelligence
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

# ── Path setup ────────────────────────────────────────────────────────────────
_THIS_DIR  = Path(__file__).parent.resolve()
_REPO_ROOT = _THIS_DIR.parent.parent.resolve()
sys.path.insert(0, str(_THIS_DIR))

from gemini_build_courses import ALL_COURSES, CourseSpec, _PAGE_FORMAT  # reuse specs

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("direct_api_gen")

COURSES_DIR  = _REPO_ROOT / "assets" / "courses"
API_KEY      = "AIzaSyAwtMnjyTcSqGOiodZ2fxTO3b8STMmnHa0"
MODEL_PRO      = "gemini-3.1-pro-preview"         # User requested; high quality for manifests
MODEL_FLASH    = "gemini-3.1-flash-lite-preview"  # Confirmed working; primary page generation
MODEL_FLASH_FB = "gemini-flash-latest"            # Alias fallback

# Minimum seconds between calls per model to stay under RPM limits
_DELAY_PRO   = 15   # low RPM quota; 15s for safety
_DELAY_FLASH = 5    # 15 RPM → 4s minimum; 5s for safety

# ── SDK setup ─────────────────────────────────────────────────────────────────

def _get_client():
    """Return an initialised google.genai Client."""
    try:
        import google.genai as genai
        return genai.Client(api_key=API_KEY)
    except ImportError:
        logger.error("google-genai not installed. Run: pip install google-genai")
        sys.exit(1)


_client = None

def get_client():
    global _client
    if _client is None:
        _client = _get_client()
    return _client


def _call_api(prompt: str, model: str, retries: int = 6) -> Optional[str]:
    """Call Gemini API with retry + back-off on 429/503."""
    client = get_client()
    delay  = _DELAY_PRO if "pro" in model else _DELAY_FLASH
    current_model = model
    for attempt in range(1, retries + 1):
        try:
            resp = client.models.generate_content(model=current_model, contents=prompt)
            text = resp.text.strip() if resp.text else ""
            if text:
                time.sleep(delay)
                return text
            logger.warning("Empty response (attempt %d/%d)", attempt, retries)
            time.sleep(5)
        except Exception as exc:
            err = str(exc)
            is_rate_limit = "429" in err or "quota" in err.lower() or "resource exhausted" in err.lower()
            is_overloaded = "503" in err or "unavailable" in err.lower() or "overloaded" in err.lower()
            is_not_found  = "404" in err or "not found" in err.lower()

            if is_not_found:
                logger.warning("Model %s not found — switching to %s", current_model, MODEL_FLASH_FB)
                current_model = MODEL_FLASH_FB
                time.sleep(3)
            elif is_rate_limit:
                wait = min(120 * attempt, 600)
                logger.warning("Rate limit on %s attempt %d/%d — waiting %ds …", current_model, attempt, retries, wait)
                time.sleep(wait)
                if "pro" in current_model and attempt >= 2:
                    logger.info("Pro quota — falling back to flash …")
                    current_model = MODEL_FLASH
            elif is_overloaded:
                wait = min(15 * (2 ** (attempt - 1)), 300)  # 15, 30, 60, 120, 240, 300
                logger.warning("503 overload on %s attempt %d/%d — waiting %ds …", current_model, attempt, retries, wait)
                time.sleep(wait)
                if current_model == MODEL_FLASH and attempt >= 2:
                    logger.info("%s overloaded — falling back to %s …", MODEL_FLASH, MODEL_FLASH_FB)
                    current_model = MODEL_FLASH_FB
            else:
                logger.error("API error attempt %d: %s", attempt, err[:300])
                time.sleep(15)

            if attempt >= retries:
                return None
    return None


# ── Topic list generation ─────────────────────────────────────────────────────

def get_or_generate_topics(course: CourseSpec, wiki_dir: Path) -> List[dict]:
    """
    Return list of {slug, title} dicts for this course.
    Prefers syllabus_research.json; falls back to generating from seed + API.
    """
    research_file = wiki_dir / "syllabus_research.json"
    if research_file.exists():
        try:
            data = json.loads(research_file.read_text(encoding="utf-8"))
            topics = data.get("master_topics", [])
            if topics:
                logger.info("Using %d topics from syllabus_research.json", len(topics))
                return [{"slug": t["slug"], "title": t["title"]} for t in topics]
        except Exception as exc:
            logger.warning("Failed to read syllabus_research.json: %s", exc)

    # Generate topic list via API
    logger.info("Generating topic list for %s via API …", course.id)
    seed_list = "\n".join(f"  - {t}" for t in course.seed_topics)
    prompt = f"""You are a curriculum designer. Generate a comprehensive topic list for a university-level course:

Course: {course.title}
Description: {course.description}
Target roles: {', '.join(course.placement_domains)}
Difficulty: {course.difficulty}
Seed topics (MUST include, may add more): 
{seed_list}

Reference syllabi from: {', '.join(course.universities[:4])}

Output a JSON array (no markdown fences) like:
[
  {{"slug": "overview", "title": "Course Overview and Introduction"}},
  {{"slug": "topic-name", "title": "Full Topic Title"}},
  ...
]

Rules:
- 20-35 topics total (comprehensive but focused)
- Order from foundational → advanced
- Every seed topic must appear
- Slugs: lowercase, hyphens only
- Always include "overview" first and "interview-prep" last
- Add an "index" entry at the very end for the course index page"""

    raw = _call_api(prompt, MODEL_PRO)
    if not raw:
        # Fall back to seed topics
        logger.warning("API topic generation failed — using seed topics only")
        return [{"slug": s, "title": s.replace("-", " ").title()} for s in course.seed_topics]

    # Clean JSON
    cleaned = re.sub(r"^```(?:json)?\n?", "", raw.strip())
    cleaned = re.sub(r"\n?```$", "", cleaned.strip())
    try:
        topics = json.loads(cleaned)
        logger.info("Generated %d topics", len(topics))
        # Save for future runs
        research_file.write_text(
            json.dumps({"course": course.id, "master_topics": [
                {"slug": t["slug"], "title": t["title"], "source_universities": course.universities[:3]}
                for t in topics
            ]}, indent=2),
            encoding="utf-8",
        )
        return topics
    except json.JSONDecodeError as exc:
        logger.error("Topic list JSON parse failed: %s\nRaw: %s", exc, raw[:400])
        return [{"slug": s, "title": s.replace("-", " ").title()} for s in course.seed_topics]


# ── Page generation ───────────────────────────────────────────────────────────

_PAGE_SYSTEM = """You are an expert professor and curriculum designer building world-class interactive course wiki pages.
Your pages are used by university students preparing for technical interviews at top companies (FAANG, product companies, top startups).
You write clear, precise, technically deep content with real code, real math, and real industry examples."""

def generate_page(course: CourseSpec, slug: str, title: str) -> Optional[str]:
    """Generate a single wiki page via direct API call."""
    prompt = f"""{_PAGE_SYSTEM}

Generate a complete, substantial wiki page for:

**Course:** {course.title}  
**Topic:** {title}  
**Slug:** {slug}  
**Target roles:** {', '.join(course.placement_domains)}  
**Code language:** {course.code_lang}  

{_PAGE_FORMAT}

Critical requirements:
- The page title must be: # {title}
- Code examples in {course.code_lang} — complete and runnable (not pseudocode)
- LaTeX math using $inline$ and $$block$$ syntax
- Real Wikipedia/Wikimedia GIF: search your knowledge for actual Wikimedia Commons URLs
  Format: ![Description](https://upload.wikimedia.org/wikipedia/commons/path/to/animation.gif)
- Mermaid diagram must be valid mermaid syntax (flowchart TD, graph LR, sequenceDiagram, etc.)
- :::demo block: self-contained HTML/CSS/JS (no external libraries) that animates the concept
- Do not include MCQ/quiz/test sections
- Interview prep must contain at least 8 common + tough interview questions with no answers
- Practice problems: Easy (1), Medium (2), Hard (1)
- Minimum 800 words of actual content (not counting code)
- Cross-references use standard markdown links: [topic title](topic-slug.md)
- Do not print YAML frontmatter keys/values as plain text in the body

Generate the complete page now (no preamble, no explanation — just the markdown starting with # {title}):"""

    return _call_api(prompt, MODEL_FLASH)


def generate_index(course: CourseSpec, topics: List[dict], wiki_dir: Path) -> Optional[str]:
    """Generate the index.md page."""
    topic_rows = "\n".join(
        f"| {i+1} | [{t['title']}]({t['slug']}.md) | ✓ | ✓ |"
        for i, t in enumerate(topics) if t["slug"] != "index"
    )
    return f"""# {course.title} — Wiki Index

> {course.description}

**Target Roles:** {', '.join(course.placement_domains)} | **Difficulty:** {course.difficulty.capitalize()}

## Topics

| # | Topic | Code | Interview |
|---|-------|------|-----------|
{topic_rows}

## Recommended Study Order

{chr(10).join(f'{i+1}. **[{t["title"]}]({t["slug"]}.md)**' for i, t in enumerate(topics) if t["slug"] not in ("index", "interview-prep"))}
{len(topics)}. **[Interview Prep](interview-prep.md)** — Interview Preparation & Mock Problems

## Tags

{' '.join(f'`{tag}`' for tag in course.tags)}
"""


def generate_manifest(course: CourseSpec, topics: List[dict], wiki_dir: Path) -> dict:
    """Build the manifest.json structure."""
    # Group topics into logical sections using Pro model
    non_index = [t for t in topics if t["slug"] != "index"]
    chunk_size = max(4, len(non_index) // 4)

    prompt = f"""Group these {len(non_index)} topics from the course "{course.title}" into 3-5 meaningful sections.

Topics (in order):
{json.dumps([t['title'] for t in non_index], indent=2)}

Output JSON array only (no fences):
[
  {{
    "title": "Section Name",
    "pages": [
      {{"slug": "topic-slug", "title": "Topic Title", "type": "concept"}},
      ...
    ]
  }},
  ...
]

Page types: "overview" for first page, "concept" for theory, "code" for code-heavy, "practice" for problems, "interview" for interview prep.
Use the exact slugs from this list: {json.dumps([t['slug'] for t in non_index])}"""

    raw = _call_api(prompt, MODEL_PRO)
    topics_grouped = []
    if raw:
        cleaned = re.sub(r"^```(?:json)?\n?", "", raw.strip())
        cleaned = re.sub(r"\n?```$", "", cleaned.strip())
        try:
            topics_grouped = json.loads(cleaned)
        except Exception:
            pass

    if not topics_grouped:
        # Fallback: auto-group by position
        pages_list = [
            {"slug": t["slug"], "title": t["title"],
             "type": "overview" if t["slug"] == "overview" else ("interview" if "interview" in t["slug"] else "concept")}
            for t in non_index
        ]
        topics_grouped = [{"title": "Course Content", "pages": pages_list}]

    return {
        "id":                course.id,
        "title":             course.title,
        "version":           "2.0.0",
        "description":       course.description,
        "wiki_page_count":   len(list(wiki_dir.glob("*.md"))),
        "built_with":        f"{MODEL_PRO} / {MODEL_FLASH} (direct API, syllabus-driven)",
        "built_at":          datetime.date.today().isoformat(),
        "tags":              course.tags,
        "placement_domains": course.placement_domains,
        "difficulty":        course.difficulty,
        "interactive":       True,
        "has_quizzes":       False,
        "has_code_examples": True,
        "has_interview_prep":True,
        "has_demos":         True,
        "has_gifs":          True,
        "syllabus_sources":  course.universities,
        "topics":            topics_grouped,
    }


# ── Course builder ─────────────────────────────────────────────────────────────

def build_course(course: CourseSpec, overwrite: bool = False) -> bool:
    wiki_dir   = COURSES_DIR / course.id / "wiki"
    wiki_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = COURSES_DIR / course.id / "manifest.json"

    logger.info("")
    logger.info("━" * 64)
    logger.info("  Course : %s", course.title)
    logger.info("  ID     : %s", course.id)
    logger.info("  Model  : pages=%s  manifest=%s", MODEL_FLASH, MODEL_PRO)
    logger.info("━" * 64)

    # 1. Get/generate topic list
    topics = get_or_generate_topics(course, wiki_dir)
    if not topics:
        logger.error("No topics found for %s", course.id)
        return False

    # 2. Existing pages
    existing = {f.stem for f in wiki_dir.glob("*.md")}
    logger.info("Existing pages: %d  Total topics: %d", len(existing), len(topics))

    to_generate = [t for t in topics if t["slug"] not in existing or overwrite]
    if not to_generate:
        logger.info("✅ All pages already exist — skipping page generation")
    else:
        logger.info("Generating %d pages …", len(to_generate))

    # 3. Generate each missing page
    generated = 0
    failed    = []
    for i, topic in enumerate(to_generate):
        slug  = topic["slug"]
        title = topic["title"]

        if slug == "index":
            continue  # generated separately below

        logger.info("[%d/%d] Generating: %s (%s)", i + 1, len(to_generate), title, slug)
        content = generate_page(course, slug, title)

        if content:
            out = wiki_dir / f"{slug}.md"
            out.write_text(content, encoding="utf-8")
            generated += 1
            logger.info("  ✓ Written %d chars to %s.md", len(content), slug)
        else:
            failed.append(slug)
            logger.warning("  ✗ Failed to generate: %s", slug)

    logger.info("Pages generated: %d  Failed: %d", generated, len(failed))

    # 4. Generate index
    if "index" not in existing or overwrite:
        logger.info("Generating index.md …")
        index_content = generate_index(course, topics, wiki_dir)
        if index_content:
            (wiki_dir / "index.md").write_text(index_content, encoding="utf-8")
            logger.info("  ✓ index.md written")

    # 5. Generate manifest
    if not manifest_path.exists() or overwrite:
        logger.info("Generating manifest.json …")
        manifest = generate_manifest(course, topics, wiki_dir)
        manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
        logger.info("  ✓ manifest.json written (%d topic groups)", len(manifest.get("topics", [])))
    else:
        logger.info("  manifest.json already exists — skipping")

    total_pages = len(list(wiki_dir.glob("*.md")))
    logger.info("✅ %s complete: %d pages, manifest=%s",
                course.id, total_pages, "✓" if manifest_path.exists() else "✗")

    if failed:
        logger.warning("  ⚠️  Failed pages (will need retry): %s", ", ".join(failed))

    return len(failed) == 0


# ── Runner ────────────────────────────────────────────────────────────────────

ALL_IDS_ORDERED = [
    "dsa-placement",
    "deep-learning",
    "software-engineering",
    "quantum-computing",
    "vlsi-design",
    "robotics",
    "artificial-intelligence",
    "machine-learning",
    "data-structures",
    "algorithms",
]


def main():
    parser = argparse.ArgumentParser(
        description="Generate courses via direct Gemini API (bypasses CLI OAuth quota).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python tools/course_gen/direct_api_generator.py --all
  python tools/course_gen/direct_api_generator.py --all --skip artificial-intelligence
  python tools/course_gen/direct_api_generator.py --course-id dsa-placement
  python tools/course_gen/direct_api_generator.py --course-id quantum-computing --overwrite
        """,
    )
    parser.add_argument("--all",        action="store_true", help="Build all incomplete courses")
    parser.add_argument("--course-id",  help="Build a single course")
    parser.add_argument("--skip",       nargs="+", default=[], metavar="ID", help="Course IDs to skip")
    parser.add_argument("--overwrite",  action="store_true", help="Overwrite existing pages")
    parser.add_argument("--start-from", help="Start from this course ID")
    args = parser.parse_args()

    # Verify API connectivity
    logger.info("Testing API connectivity …")
    test = _call_api("Say: ready", MODEL_FLASH, retries=2)
    if not test:
        # Try with pro model as last resort check
        test = _call_api("Say: ready", MODEL_PRO, retries=2)
    if not test:
        logger.error("❌ API not reachable — check key and quota")
        sys.exit(1)
    logger.info("✅ API ready (%s)", MODEL_FLASH)

    courses_by_id = {c.id: c for c in ALL_COURSES}
    skip = set(args.skip)
    results = {}

    if args.course_id:
        course = courses_by_id.get(args.course_id)
        if not course:
            logger.error("Unknown course id: %s", args.course_id)
            sys.exit(1)
        ok = build_course(course, overwrite=args.overwrite)
        results[args.course_id] = "✅ done" if ok else "⚠️  partial"

    elif args.all:
        ids = list(ALL_IDS_ORDERED)
        if args.start_from:
            try:
                idx = ids.index(args.start_from)
                ids = ids[idx:]
            except ValueError:
                logger.error("Unknown start-from id: %s", args.start_from)
                sys.exit(1)

        logger.info("Building %d courses (skipping: %s) …", len(ids), skip or "none")

        for i, cid in enumerate(ids):
            if cid in skip:
                logger.info("⏭️  Skipping: %s", cid)
                results[cid] = "skipped"
                continue
            course = courses_by_id.get(cid)
            if not course:
                logger.warning("Unknown course id in order list: %s", cid)
                continue

            logger.info("\n[%d/%d] Starting: %s", i + 1, len(ids), course.title)
            ok = build_course(course, overwrite=args.overwrite)
            results[cid] = "✅ done" if ok else "⚠️  partial"

            if i < len(ids) - 1:
                logger.info("Pausing 10s before next course …")
                time.sleep(10)

    else:
        parser.print_help()
        sys.exit(0)

    print(f"\n{'='*60}")
    print("RESULTS:")
    for cid, status in results.items():
        # Strip emoji for Windows CP1252 consoles
        safe = status.encode("ascii", "ignore").decode()
        print(f"  {safe or status[:8]:20s}  {cid}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()
