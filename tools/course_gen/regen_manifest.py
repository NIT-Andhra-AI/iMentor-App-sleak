"""Regenerate manifest for AI and Algorithms courses after expansion — uses Flash model."""
import sys, json, datetime, re
sys.path.insert(0, '.')
from direct_api_generator import ALL_COURSES, _call_api, COURSES_DIR, MODEL_FLASH

for cid in ["artificial-intelligence", "algorithms"]:
    course = next((c for c in ALL_COURSES if c.id == cid), None)
    if not course:
        print(f"Course not found: {cid}")
        continue
    wiki_dir = COURSES_DIR / course.id / "wiki"
    manifest_path = COURSES_DIR / course.id / "manifest.json"
    research_file = wiki_dir / "syllabus_research.json"
    if not research_file.exists():
        print(f"No syllabus_research.json for {cid}")
        continue
    research = json.loads(research_file.read_text(encoding="utf-8"))
    topics = [{"slug": t["slug"], "title": t["title"]} for t in research["master_topics"]]
    existing = {f.stem for f in wiki_dir.glob("*.md")}
    topics = [t for t in topics if t["slug"] in existing]
    print(f"{cid}: {len(topics)} topics with pages")

    non_index = [t for t in topics if t["slug"] != "index"]
    prompt = f"""Group these {len(non_index)} topics from "{course.title}" into 3-5 logical sections.
Topics: {json.dumps([t['title'] for t in non_index])}
Output JSON array only (no markdown fences):
[{{"title":"Section Name","pages":[{{"slug":"slug","title":"Title","type":"concept"}}]}}]
Use exact slugs from: {json.dumps([t['slug'] for t in non_index])}
Types: overview/concept/code/practice/interview"""

    raw = _call_api(prompt, MODEL_FLASH)
    groups = []
    if raw:
        cleaned = re.sub(r"^```(?:json)?\n?", "", raw.strip())
        cleaned = re.sub(r"\n?```$", "", cleaned.strip())
        try:
            groups = json.loads(cleaned)
        except Exception as e:
            print(f"  JSON parse failed: {e}")
    if not groups:
        pages_list = [{"slug": t["slug"], "title": t["title"],
                       "type": "overview" if t["slug"] == "overview" else
                               ("interview" if "interview" in t["slug"] or "placement" in t["slug"] else "concept")}
                      for t in non_index]
        groups = [{"title": "Course Content", "pages": pages_list}]

    manifest = {
        "id": course.id, "title": course.title, "version": "2.0.0",
        "description": course.description,
        "wiki_page_count": len(list(wiki_dir.glob("*.md"))),
        "built_at": datetime.date.today().isoformat(),
        "tags": course.tags, "placement_domains": course.placement_domains,
        "difficulty": course.difficulty, "interactive": True,
        "has_quizzes": True, "has_code_examples": True,
        "has_interview_prep": True, "has_demos": True, "has_gifs": True,
        "syllabus_sources": course.universities, "topics": groups,
    }
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"  -> manifest written: {len(groups)} groups, {manifest['wiki_page_count']} pages")

