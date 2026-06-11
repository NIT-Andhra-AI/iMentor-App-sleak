#!/usr/bin/env python3
"""
Student AI — Course Wiki Generator

Generates AI-powered wiki pages for a course by:
1. Loading lecture PDFs + syllabus.csv from assets/courses/{course-id}/raw/
2. Extracting a knowledge graph (concepts + relationships)
3. Generating detailed lecture notes per concept
4. Writing markdown pages to assets/courses/{course-id}/wiki/

Requires: llama-cpp-python server running on http://127.0.0.1:8080/v1
  Ubuntu:   tools/course_gen/start-server.sh [model-path]
  Windows:  tools\\course_gen\\start-server.ps1 [model-path]

Usage:
    # From the project root (app/):
    python tools/course_gen/generate_wiki.py machine-learning
    python tools/course_gen/generate_wiki.py machine-learning --overwrite
    python tools/course_gen/generate_wiki.py machine-learning --concepts-only
"""
import argparse
import logging
import os
import sys

# Allow running from project root: python tools/course_gen/generate_wiki.py
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from course_gen import config, llm_client
from course_gen.concept_extractor import extract_knowledge_graph
from course_gen.note_writer import generate_all_notes
from course_gen.wiki_writer import write_wiki

try:
    from course_gen.course_loader import load_course
    from course_gen.syllabus_loader import find_syllabus
except ImportError:
    # Fallback: loaders not available, skip PDF loading
    load_course = None
    find_syllabus = None

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("generate_wiki")


def main():
    parser = argparse.ArgumentParser(
        description="Generate AI wiki pages for a Student AI course."
    )
    parser.add_argument("course_id", help="Course directory name (e.g. machine-learning)")
    parser.add_argument(
        "--overwrite", action="store_true",
        help="Overwrite existing wiki pages (default: skip existing)"
    )
    parser.add_argument(
        "--concepts-only", action="store_true",
        help="Only extract knowledge graph, skip note generation"
    )
    parser.add_argument(
        "--course-name", default="",
        help="Display name for the course (default: inferred from directory)"
    )
    parser.add_argument(
        "--llm-url", default=config.LLM_URL,
        help=f"llama-cpp-python server URL (default: {config.LLM_URL})"
    )
    args = parser.parse_args()

    # Override config URL if provided
    if args.llm_url != config.LLM_URL:
        config.LLM_URL = args.llm_url
        logger.info("Using custom LLM URL: %s", config.LLM_URL)

    # Resolve paths
    course_dir = os.path.join(config.COURSES_DIR, args.course_id)
    raw_dir    = os.path.join(course_dir, "raw")

    if not os.path.isdir(course_dir):
        logger.error("Course directory not found: %s", course_dir)
        sys.exit(1)

    # ── 1. Health check ────────────────────────────────────────────────
    logger.info("Checking LLM server at %s ...", config.LLM_URL)
    if not llm_client.check_health():
        _cmd = (
            "tools\\course_gen\\start-server.ps1"
            if sys.platform == "win32"
            else "tools/course_gen/start-server.sh"
        )
        logger.error(
            "LLM server not reachable at %s\n"
            "Start it with:  %s",
            config.LLM_URL, _cmd
        )
        sys.exit(1)
    logger.info("LLM server OK")

    # ── 2. Load course materials ───────────────────────────────────────
    course_name = args.course_name or args.course_id.replace("-", " ").title()
    source_text = ""
    syllabus = None

    if load_course and os.path.isdir(raw_dir):
        try:
            logger.info("Loading course materials from %s ...", raw_dir)
            course = load_course(raw_dir, course_name=course_name)
            source_text = course.combined_text[:12000]  # Cap to keep prompt manageable
            logger.info("Course materials loaded: %s", course.summary)
        except Exception as exc:
            logger.warning("Could not load course materials: %s — proceeding without", exc)

    if find_syllabus and os.path.isdir(course_dir):
        syllabus = find_syllabus(course_dir, course_name=course_name)
        if syllabus:
            logger.info("Syllabus loaded: %s", syllabus.summary)
        else:
            logger.info("No syllabus.csv found — knowledge graph will be self-directed")

    # ── 3. Extract knowledge graph ─────────────────────────────────────
    logger.info("Extracting knowledge graph for: %s ...", course_name)
    kg = extract_knowledge_graph(
        topic=course_name,
        source_text=source_text,
        syllabus=syllabus,
    )
    if kg is None:
        logger.error("Knowledge graph extraction failed. Check LLM server logs.")
        sys.exit(1)

    logger.info(
        "Knowledge graph: %d concepts, %d relationships",
        len(kg.concepts), len(kg.relationships)
    )

    if args.concepts_only:
        logger.info("--concepts-only: skipping note generation")
        # Write a minimal wiki with just the overview
        write_wiki(args.course_id, kg, [], config.COURSES_DIR, overwrite=args.overwrite)
        logger.info("Done (concepts-only mode)")
        return

    # ── 4. Generate per-concept notes ─────────────────────────────────
    logger.info("Generating notes for %d concepts ...", len(kg.concepts))
    notes = generate_all_notes(kg)

    succeeded = sum(1 for _, n in notes if n is not None)
    failed    = len(notes) - succeeded
    logger.info("Notes complete: %d succeeded, %d failed", succeeded, failed)

    # ── 5. Write wiki pages ────────────────────────────────────────────
    manifest = write_wiki(
        course_id=args.course_id,
        kg=kg,
        notes=notes,
        courses_dir=config.COURSES_DIR,
        overwrite=args.overwrite,
    )
    logger.info(
        "\n✅ Wiki generated: %d pages for '%s'\n   → %s",
        manifest["page_count"],
        manifest["title"],
        os.path.join(config.COURSES_DIR, args.course_id, "wiki"),
    )


if __name__ == "__main__":
    main()
