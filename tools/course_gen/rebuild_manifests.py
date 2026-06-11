#!/usr/bin/env python3
"""
Rebuild all course manifests with proper MODULE structure.

Groups pages by the 'section' field in textbook_syllabi/{id}.json.
Pages that exist on disk but not in syllabi go into an "Additional Topics" module.

Usage:
    python tools/course_gen/rebuild_manifests.py --all
    python tools/course_gen/rebuild_manifests.py --course-id data-structures
"""
from __future__ import annotations
import argparse, json, re, sys
from pathlib import Path
from typing import List, Dict

_THIS_DIR  = Path(__file__).parent.resolve()
_REPO_ROOT = _THIS_DIR.parent.parent.resolve()
sys.path.insert(0, str(_THIS_DIR))
from gemini_build_courses import ALL_COURSES
from direct_api_generator import COURSES_DIR

SYLLABI_DIR = _THIS_DIR / "textbook_syllabi"

# ── Page type classifier ────────────────────────────────────────────────────
def classify_page(slug: str, title: str) -> str:
    s = slug.lower()
    if s in ("index", "overview"):         return "overview"
    if "interview" in s or "placement" in s: return "interview"
    if "quiz" in s or "practice" in s:     return "quiz"
    if "lab" in s or "coding" in s:        return "lab"
    if "project" in s:                      return "project"
    return "concept"

def page_icon(ptype: str) -> str:
    icons = {"overview":"🗺️","interview":"💼","quiz":"📝","lab":"🧪","project":"🚀","concept":"📄"}
    return icons.get(ptype, "📄")

def slug_to_title(slug: str) -> str:
    return " ".join(w.capitalize() for w in slug.replace("-", " ").split())

def extract_title(md_path: Path) -> str:
    try:
        text = md_path.read_text(encoding="utf-8", errors="ignore")
        # Try frontmatter title
        fm = re.search(r"^---\s*\n(.*?)\n---", text, re.DOTALL)
        if fm:
            tm = re.search(r"^title:\s*[\"']?(.+?)[\"']?\s*$", fm.group(1), re.MULTILINE)
            if tm: return tm.group(1).strip()
        # Try first H1
        h1 = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
        if h1: return h1.group(1).strip()
    except Exception:
        pass
    return slug_to_title(md_path.stem)


def build_manifest(course_id: str) -> dict:
    course = next((c for c in ALL_COURSES if c.id == course_id), None)
    if not course:
        print(f"  ⚠ Unknown course: {course_id}")
        return {}

    wiki_dir    = COURSES_DIR / course_id / "wiki"
    syllabus_f  = SYLLABI_DIR / f"{course_id}.json"
    manifest_f  = COURSES_DIR / course_id / "manifest.json"

    # Existing manifest (preserve metadata)
    old_mf: dict = {}
    if manifest_f.exists():
        try: old_mf = json.loads(manifest_f.read_text(encoding="utf-8"))
        except Exception: pass

    # All existing .md pages on disk
    disk_pages = {p.stem: p for p in wiki_dir.glob("*.md")} if wiki_dir.exists() else {}

    # Load syllabus topics (ordered, with section)
    syllabus_topics: list = []
    sections_order: list  = []
    section_map: Dict[str, list] = {}   # section → [topic_dict]

    if syllabus_f.exists():
        try:
            data = json.loads(syllabus_f.read_text(encoding="utf-8"))
            syllabus_topics = data.get("topics", [])
        except Exception:
            pass

    for t in syllabus_topics:
        sec = t.get("section", "Core Topics")
        if sec not in section_map:
            section_map[sec] = []
            sections_order.append(sec)
        section_map[sec].append(t)

    # Build modules list
    modules: list = []

    # ── Module 0: Getting Started (always) ─────────────────────────────────
    intro_pages = []
    for slug in ("index", "overview"):
        if slug in disk_pages:
            title = extract_title(disk_pages[slug])
            intro_pages.append({"slug": slug, "title": title, "type": "overview"})
    if intro_pages:
        modules.append({"id": "getting-started", "title": "Getting Started",
                        "description": f"Introduction and overview of {course.title}",
                        "icon": "🎓", "pages": intro_pages})

    # ── Syllabus-driven modules ─────────────────────────────────────────────
    slugs_in_modules = {"index", "overview"}

    for i, sec in enumerate(sections_order, start=1):
        topics = section_map[sec]
        pages = []
        for t in topics:
            slug = t["slug"]
            if slug in ("index", "overview"): continue
            if slug not in disk_pages: continue  # page not generated yet
            slugs_in_modules.add(slug)
            title = extract_title(disk_pages[slug])
            ptype = classify_page(slug, title)
            pages.append({"slug": slug, "title": title, "type": ptype})

        if pages:
            mod_id = re.sub(r"[^a-z0-9]+", "-", sec.lower()).strip("-")
            modules.append({
                "id": mod_id,
                "title": f"Module {i}: {sec}",
                "description": _module_description(sec, course.title),
                "icon": _module_icon(sec),
                "pages": pages,
            })

    # ── Additional topics (on disk, not in syllabus) ────────────────────────
    extra = []
    for slug, path in sorted(disk_pages.items()):
        if slug in slugs_in_modules: continue
        title = extract_title(path)
        ptype = classify_page(slug, title)
        extra.append({"slug": slug, "title": title, "type": ptype})
    if extra:
        modules.append({"id": "additional-topics", "title": "Additional Topics",
                        "description": "Supplementary pages and placement guides",
                        "icon": "📚", "pages": extra})

    # ── Count all pages ────────────────────────────────────────────────────
    total_pages = sum(len(m["pages"]) for m in modules)

    new_mf = {
        "id":             course_id,
        "title":          course.title,
        "version":        old_mf.get("version", "2.0.0"),
        "description":    old_mf.get("description", course.description if hasattr(course, "description") else ""),
        "placement_domains": list(course.placement_domains),
        "wiki_page_count": total_pages,
        "module_count":   len(modules),
        "built_with":     old_mf.get("built_with", "gemini-flash-latest"),
        "built_at":       old_mf.get("built_at", ""),
        "tags":           old_mf.get("tags", []),
        "modules":        modules,
        # Legacy compat: keep 'topics' pointing to modules for old code
        "topics":         modules,
    }
    manifest_f.write_text(json.dumps(new_mf, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  ✓ {course_id}: {len(modules)} modules, {total_pages} pages")
    return new_mf


def _module_icon(section: str) -> str:
    s = section.lower()
    icons = {
        "foundation": "🏗️", "introduction": "🎓", "basics": "🔤",
        "sorting": "🔀", "search": "🔍", "tree": "🌲", "graph": "🕸️",
        "dynamic": "⚡", "greedy": "🎯", "string": "📝", "advanced": "🚀",
        "network": "🌐", "security": "🔒", "database": "🗄️", "system": "⚙️",
        "hardware": "🔧", "logic": "💡", "quantum": "⚛️", "robot": "🤖",
        "machine": "🧠", "deep": "🧬", "neural": "🔮", "career": "💼",
        "interview": "💼", "placement": "🎯", "compiler": "⚙️", "os": "💻",
        "memory": "🗂️", "process": "🔄", "concurr": "🧵", "virtual": "🖥️",
        "vlsi": "🔌", "design": "📐", "fabricat": "🏭", "verif": "✅",
    }
    for k, v in icons.items():
        if k in s: return v
    return "📖"


def _module_description(section: str, course_title: str) -> str:
    return f"{section} topics in {course_title}"


def main():
    ap = argparse.ArgumentParser(description="Rebuild course manifests with module structure")
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--all", action="store_true")
    g.add_argument("--course-id", nargs="+", metavar="ID")
    args = ap.parse_args()

    courses = ALL_COURSES if args.all else [c for c in ALL_COURSES if c.id in args.course_id]
    if not courses:
        print("No courses found"); sys.exit(1)

    print(f"\nRebuilding manifests for {len(courses)} course(s)...")
    for course in courses:
        build_manifest(course.id)
    print("\nDone.")

if __name__ == "__main__":
    main()
