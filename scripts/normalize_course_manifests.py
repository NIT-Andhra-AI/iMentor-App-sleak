#!/usr/bin/env python3
import argparse
import copy
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Tuple

ROOT = Path(__file__).resolve().parents[1] / "assets" / "courses"
CANONICAL_MODULE_IDS = [
    "getting-started",
    "core-lectures",
    "practice",
    "career-prep",
    "reference",
]
ALLOWED_PAGE_TYPES = {"overview", "concept", "interview", "quiz", "lab", "code", "project", "reference"}


def slug_to_title(slug: str) -> str:
    return " ".join(part.capitalize() for part in slug.replace("_", "-").split("-"))


def extract_title(md_path: Path) -> str:
    text = md_path.read_text(encoding="utf-8", errors="ignore")

    # Try YAML frontmatter title first.
    fm_match = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, flags=re.S)
    if fm_match:
        fm = fm_match.group(1)
        t_match = re.search(r'^title:\s*["\']?(.*?)["\']?\s*$', fm, flags=re.M)
        if t_match:
            title = t_match.group(1).strip()
            if title:
                return title

    # Fall back to first markdown heading.
    for line in text.splitlines():
        if line.startswith("# "):
            title = line[2:].strip()
            if title:
                return title

    return slug_to_title(md_path.stem)


def page_type_for_slug(slug: str, existing_type: str | None = None) -> str:
    if existing_type and existing_type in ALLOWED_PAGE_TYPES:
        return existing_type
    if slug in {"index", "overview"}:
        return "overview"
    if slug in {"log", "changelog", "release-notes", "syllabus_research"}:
        return "reference"
    if any(k in slug for k in ["quiz", "mcq", "assessment", "practice"]):
        return "quiz"
    if any(k in slug for k in ["lab", "hands-on", "coding-lab"]):
        return "lab"
    if any(k in slug for k in ["code", "implementation"]):
        return "code"
    if any(k in slug for k in ["project", "capstone"]):
        return "project"
    if "placement" in slug or "interview" in slug:
        return "interview"
    return "concept"


def ordered_unique(items: List[str]) -> List[str]:
    seen = set()
    out = []
    for item in items:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def build_module(module_id: str, title: str, description: str, icon: str, slugs: List[str], title_map: Dict[str, str], type_map: Dict[str, str]) -> Dict:
    return {
        "id": module_id,
        "title": title,
        "description": description,
        "icon": icon,
        "pages": [
            {
                "slug": slug,
                "title": title_map[slug],
                "type": page_type_for_slug(slug, type_map.get(slug)),
            }
            for slug in slugs
        ],
    }


def classify_slugs(all_slugs: List[str], existing_order: List[str], type_map: Dict[str, str]) -> Dict[str, List[str]]:
    all_set = set(all_slugs)
    getting_started = [slug for slug in ["index", "overview"] if slug in all_set]

    remaining = [slug for slug in all_slugs if slug not in set(getting_started)]

    practice = [
        slug for slug in remaining
        if type_map.get(slug) in {"quiz", "lab", "code", "project"}
    ]
    career = [
        slug for slug in remaining
        if type_map.get(slug) == "interview"
        or any(k in slug for k in ["placement", "interview"])
    ]
    reference = [
        slug for slug in remaining
        if type_map.get(slug) == "reference"
        or slug in {"log", "changelog", "release-notes", "syllabus_research"}
    ]

    assigned = set(getting_started) | set(practice) | set(career) | set(reference)
    core = [slug for slug in remaining if slug not in assigned]

    def ordered_bucket(bucket: List[str]) -> List[str]:
        base = [slug for slug in existing_order if slug in bucket]
        extra = sorted([slug for slug in bucket if slug not in set(base)])
        return ordered_unique(base + extra)

    return {
        "getting-started": ordered_bucket(getting_started),
        "core-lectures": ordered_bucket(core),
        "practice": ordered_bucket(practice),
        "career-prep": ordered_bucket(career),
        "reference": ordered_bucket(reference),
    }


def normalize_manifest(course_dir: Path, check_only: bool = False) -> Tuple[int, int, List[str]]:
    manifest_path = course_dir / "manifest.json"
    wiki_dir = course_dir / "wiki"
    data = json.loads(manifest_path.read_text(encoding="utf-8"))

    wiki_files = sorted(wiki_dir.glob("*.md"))
    all_slugs = [p.stem for p in wiki_files]

    existing_pages = []
    for mod in data.get("modules", []):
        existing_pages.extend(mod.get("pages", []))
    if not existing_pages:
        for mod in data.get("topics", []):
            existing_pages.extend(mod.get("pages", []))

    existing_title_map = {p.get("slug"): p.get("title") for p in existing_pages if p.get("slug") and p.get("title")}
    existing_type_map = {p.get("slug"): p.get("type") for p in existing_pages if p.get("slug") and p.get("type")}
    existing_order = ordered_unique([p.get("slug") for p in existing_pages if p.get("slug")])

    current_modules = data.get("modules", [])
    current_topics = data.get("topics", [])
    current_module_ids = [m.get("id") for m in current_modules]
    current_listed_slugs = [
        p.get("slug")
        for m in current_modules
        for p in m.get("pages", [])
        if p.get("slug")
    ]

    title_map: Dict[str, str] = {}
    type_map: Dict[str, str] = {}

    for slug in all_slugs:
        title_map[slug] = existing_title_map.get(slug) or extract_title(wiki_dir / f"{slug}.md")
        type_map[slug] = page_type_for_slug(slug, existing_type_map.get(slug))

    buckets = classify_slugs(all_slugs, existing_order, type_map)

    modules = [
        build_module(
            "getting-started",
            "Getting Started",
            f"Introduction and overview of {data.get('title', course_dir.name)}",
            "🎓",
            buckets["getting-started"],
            title_map,
            type_map,
        ),
        build_module(
            "core-lectures",
            "Core Lectures",
            "All lectures and concept pages for this course",
            "📘",
            buckets["core-lectures"],
            title_map,
            type_map,
        ),
        build_module(
            "practice",
            "Practice",
            "Practice, quizzes, coding, and project pages",
            "🧪",
            buckets["practice"],
            title_map,
            type_map,
        ),
        build_module(
            "career-prep",
            "Career Prep",
            "Interview and placement focused pages",
            "💼",
            buckets["career-prep"],
            title_map,
            type_map,
        ),
        build_module(
            "reference",
            "Reference",
            "Reference and operational pages",
            "📎",
            buckets["reference"],
            title_map,
            type_map,
        ),
    ]

    listed_slugs = [p.get("slug") for m in modules for p in m.get("pages", []) if p.get("slug")]
    listed_set = set(listed_slugs)
    all_set = set(all_slugs)
    duplicate_slugs = sorted([s for s in set(listed_slugs) if listed_slugs.count(s) > 1])
    missing_from_manifest = sorted(all_set - listed_set)
    dangling_from_manifest = sorted(listed_set - all_set)

    issues: List[str] = []

    # In validation mode, verify the manifest as-is.
    if check_only:
        current_set = set(current_listed_slugs)
        current_duplicates = sorted([s for s in set(current_listed_slugs) if current_listed_slugs.count(s) > 1])
        current_missing = sorted(all_set - current_set)
        current_dangling = sorted(current_set - all_set)

        if current_module_ids != CANONICAL_MODULE_IDS:
            issues.append("module id order does not match canonical module order")
        if current_topics != current_modules:
            issues.append("topics field diverges from modules field")
        if current_duplicates:
            issues.append(f"duplicate listed slugs: {current_duplicates[:10]}")
        if current_missing:
            issues.append(f"wiki files not listed in manifest: {current_missing[:10]}")
        if current_dangling:
            issues.append(f"manifest slugs missing wiki files: {current_dangling[:10]}")
    else:
        # In normalization mode, validate the generated canonical structure.
        if [m.get("id") for m in modules] != CANONICAL_MODULE_IDS:
            issues.append("module id order does not match canonical module order")
        if duplicate_slugs:
            issues.append(f"duplicate listed slugs: {duplicate_slugs[:10]}")
        if missing_from_manifest:
            issues.append(f"wiki files not listed in manifest: {missing_from_manifest[:10]}")
        if dangling_from_manifest:
            issues.append(f"manifest slugs missing wiki files: {dangling_from_manifest[:10]}")

    if "index" not in all_set or "overview" not in all_set:
        issues.append("required entry pages missing: index.md and/or overview.md")

    data["wiki_page_count"] = len(all_slugs)
    data["module_count"] = len(modules)
    data["modules"] = modules
    data["topics"] = copy.deepcopy(modules)

    if not check_only:
        manifest_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    listed = len(listed_slugs)
    return len(all_slugs), listed, issues


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize and validate course manifests")
    parser.add_argument("--check-only", action="store_true", help="Only validate manifests; do not write files")
    parser.add_argument("--course", type=str, help="Run only for a single course id")
    args = parser.parse_args()

    courses = sorted([p for p in ROOT.iterdir() if p.is_dir() and (p / "manifest.json").exists()])
    if args.course:
        courses = [p for p in courses if p.name == args.course]
        if not courses:
            print(f"No matching course found for --course={args.course}")
            sys.exit(1)

    action = "Validating" if args.check_only else "Normalizing"
    print(f"{action} {len(courses)} course manifests...")

    has_errors = False
    ok_count = 0
    for course in courses:
        files_count, listed_count, issues = normalize_manifest(course, check_only=args.check_only)
        if issues:
            has_errors = True
            print(f"- {course.name}: wiki_files={files_count}, listed_pages={listed_count}, status=FAIL")
            for issue in issues:
                print(f"  - {issue}")
        else:
            ok_count += 1
            print(f"- {course.name}: wiki_files={files_count}, listed_pages={listed_count}, status=OK")

    print(f"Summary: ok={ok_count}, failed={len(courses) - ok_count}, total={len(courses)}")

    if has_errors:
        sys.exit(1)


if __name__ == "__main__":
    main()
