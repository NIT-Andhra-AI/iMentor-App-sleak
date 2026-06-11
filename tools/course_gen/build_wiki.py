#!/usr/bin/env python3
"""
build-wiki.py — Offline LLM Wiki builder for Student AI courses.

Runs on the DEVELOPER'S machine (16 GB GPU) using a local GGUF model.
No external API calls. Fully offline.

The syllabus.csv (if present) is used as a GUIDE — it helps the LLM understand
the course structure and what to look for in each resource. It does NOT restrict
the LLM: any concept, algorithm, or insight found in the lecture notes gets its
own wiki page, whether or not it appears in the syllabus.

Recommended models (GGUF, 16 GB GPU):
  - Qwen2.5-14B-Instruct-Q4_K_M.gguf   (~8.5 GB VRAM)  ← best quality
  - gemma-3-4b-it-Q8_0.gguf            (~4.5 GB VRAM)  ← faster

Install:
  CMAKE_ARGS="-DGGML_CUDA=on" pip install llama-cpp-python
  pip install pypdf

Usage:
  python scripts/build-wiki.py --model ~/models/Qwen2.5-14B-Instruct-Q4_K_M.gguf \\
                                --course machine-learning
"""

import os
import re
import csv
import json
import argparse
import datetime
from pathlib import Path
from collections import defaultdict

# ── PDF extraction ─────────────────────────────────────────────────────────────
HAS_PYPDF = False
HAS_PDFPLUMBER = False
try:
    import pypdf
    HAS_PYPDF = True
except ImportError:
    try:
        import pdfplumber
        HAS_PDFPLUMBER = True
    except ImportError:
        pass

# ── Local LLM ─────────────────────────────────────────────────────────────────
try:
    from llama_cpp import Llama
except ImportError:
    raise SystemExit(
        "ERROR: llama-cpp-python not installed.\n"
        "  CMAKE_ARGS='-DGGML_CUDA=on' pip install llama-cpp-python"
    )

# ── Constants ──────────────────────────────────────────────────────────────────
ASSETS_DIR = Path(__file__).parent.parent.parent / "assets" / "courses"

WIKI_MODEL_LINKS = {
    "Qwen2.5-14B-Instruct-Q4_K_M.gguf": {
        "page": "https://huggingface.co/unsloth/Qwen2.5-14B-Instruct-GGUF",
        "url":  "https://huggingface.co/unsloth/Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf",
        "cli":  "huggingface-cli download unsloth/Qwen2.5-14B-Instruct-GGUF Qwen2.5-14B-Instruct-Q4_K_M.gguf --local-dir ~/wiki-models",
        "vram": "~8.5 GB",
    },
    "gemma-3-4b-it-Q4_K_M.gguf": {
        "page": "https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF",
        "url":  "https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf",
        "cli":  "huggingface-cli download ggml-org/gemma-3-4b-it-GGUF gemma-3-4b-it-Q4_K_M.gguf --local-dir ~/wiki-models",
        "vram": "~2.5 GB",
    },
}

SCHEMA_SYSTEM = """You are building a student wiki for a university machine learning course.

RULES:
1. Every page starts with a single H1 (# Title).
2. Cross-references use [[Exact Page Title]] syntax — match the title exactly.
3. Every page ends with a ## See Also section.
4. Write clearly for a university student — precise but accessible.
5. Flag contradictions between sources with ⚠️.
6. The syllabus is a GUIDE, not a limit. If the material contains important
   concepts not listed in the syllabus, create pages for them anyway.
7. Go DEEP: sub-topics, proofs, intuitions, worked examples are all valuable.
8. Never include raw source filenames in the wiki content."""

# ── Global model ───────────────────────────────────────────────────────────────
_llm: Llama | None = None


# ══════════════════════════════════════════════════════════════════════════════
# Model loading
# ══════════════════════════════════════════════════════════════════════════════

def load_model(model_path: str, n_gpu_layers: int, n_ctx: int) -> None:
    global _llm
    if not Path(model_path).exists():
        fname = Path(model_path).name
        print(f"\nERROR: Model not found: {model_path}\n")
        if fname in WIKI_MODEL_LINKS:
            info = WIKI_MODEL_LINKS[fname]
            print(f"  Download: {info['url']}")
            print(f"  CLI:      {info['cli']}")
            if "note" in info:
                print(f"  NOTE:     {info['note']}")
        else:
            print("  Recommended models:")
            for name, info in WIKI_MODEL_LINKS.items():
                print(f"  {name}  ({info['vram']})  {info['page']}")
        raise SystemExit(1)

    print(f"Loading model : {Path(model_path).name}")
    print(f"GPU layers    : {'all' if n_gpu_layers == -1 else n_gpu_layers}  |  Context: {n_ctx} tokens")
    _llm = Llama(model_path=model_path, n_gpu_layers=n_gpu_layers,
                 n_ctx=n_ctx, n_threads=4, verbose=False)
    print("Model loaded.\n")


def llm(system: str, user: str, max_tokens: int = 1500) -> str:
    assert _llm is not None
    resp = _llm.create_chat_completion(
        messages=[{"role": "system", "content": system},
                  {"role": "user",   "content": user}],
        max_tokens=max_tokens,
        temperature=0.3,
        repeat_penalty=1.1,
        stop=["<|endoftext|>", "<|im_end|>"],
    )
    return resp["choices"][0]["message"]["content"].strip()


# ══════════════════════════════════════════════════════════════════════════════
# Syllabus parsing
# ══════════════════════════════════════════════════════════════════════════════

class Syllabus:
    """Parsed course syllabus — used as a guide, never a restriction."""

    def __init__(self):
        self.modules: dict[str, list[dict]] = {}      # module → [lecture, ...]
        self.resource_map: dict[str, list[dict]] = {}  # "R1" → [lectures that cite it]
        self.all_topics: list[str] = []
        self.all_subtopics: list[str] = []

    @classmethod
    def load(cls, csv_path: Path) -> "Syllabus":
        s = cls()
        if not csv_path.exists():
            print(f"  (no syllabus.csv found at {csv_path} — proceeding without syllabus guidance)")
            return s

        with open(csv_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                module   = row.get("Module", "").strip()
                lec_num  = row.get("Lecture Number", "").strip()
                topic    = row.get("Lecture Topic", "").strip()
                subtopics = [s.strip() for s in row.get("Subtopics", "").split() if s.strip()]
                resources = cls._parse_resources(row.get("Resources", ""))

                if not module or not topic:
                    continue

                lecture = {
                    "lecture_number": lec_num,
                    "topic": topic,
                    "subtopics": subtopics,
                    "resources": resources,
                }
                s.modules.setdefault(module, []).append(lecture)

                if topic and "Review" not in topic and "Wrap" not in topic:
                    s.all_topics.append(topic)
                s.all_subtopics.extend(subtopics)

                for res in resources:
                    s.resource_map.setdefault(res, []).append(lecture)

        print(f"  Syllabus: {sum(len(v) for v in s.modules.values())} lectures across {len(s.modules)} modules")
        print(f"  Resource map: {sorted(s.resource_map.keys())}")
        return s

    @staticmethod
    def _parse_resources(raw: str) -> list[str]:
        """Extract resource IDs like R1, R2, R9 from a messy Resources string."""
        return list(dict.fromkeys(re.findall(r"\bR\d+\b", raw)))

    def resource_context(self, resource_id: str) -> str:
        """
        Return a syllabus guidance string for a given resource (e.g. "R1").
        Tells the LLM which topics this resource covers — as a guide only.
        """
        lectures = self.resource_map.get(resource_id, [])
        if not lectures:
            return ""

        lines = [
            f"SYLLABUS GUIDANCE FOR {resource_id}",
            "The course syllabus indicates this resource covers the following topics.",
            "Use these as a guide to identify key content, but also document ANY",
            "additional concepts, proofs, examples, or insights you discover —",
            "even if they are not listed here.\n",
        ]
        by_module: dict[str, list[dict]] = defaultdict(list)
        for lec in lectures:
            # find module for this lecture
            for mod, lecs in self.modules.items():
                if any(l["topic"] == lec["topic"] for l in lecs):
                    by_module[mod].append(lec)
                    break

        for mod, lecs in by_module.items():
            lines.append(f"{mod}:")
            for lec in lecs:
                subs = ", ".join(lec["subtopics"]) if lec["subtopics"] else "—"
                lines.append(f"  • Lecture {lec['lecture_number']}: {lec['topic']}")
                lines.append(f"    Subtopics: {subs}")
        return "\n".join(lines)

    def module_context(self, module: str) -> str:
        """Return all lectures for a module as a formatted string."""
        lectures = self.modules.get(module, [])
        if not lectures:
            return ""
        lines = [f"Lectures in {module}:"]
        for lec in lectures:
            subs = ", ".join(lec["subtopics"]) if lec["subtopics"] else ""
            lines.append(f"  Lecture {lec['lecture_number']}: {lec['topic']}" +
                         (f" [{subs}]" if subs else ""))
        return "\n".join(lines)

    def course_overview_context(self) -> str:
        """Full syllabus as a compact string for overview/index generation."""
        lines = []
        for mod, lectures in self.modules.items():
            lines.append(f"\n{mod}:")
            for lec in lectures:
                subs = ", ".join(lec["subtopics"]) if lec["subtopics"] else ""
                lines.append(f"  L{lec['lecture_number']}: {lec['topic']}" +
                             (f" — {subs}" if subs else ""))
        return "\n".join(lines)


# ══════════════════════════════════════════════════════════════════════════════
# File helpers
# ══════════════════════════════════════════════════════════════════════════════

def slugify(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    return text.strip("-")


def read_file(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        return extract_pdf(path)
    return path.read_text(encoding="utf-8", errors="replace")


def write_file(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")
    print(f"  wrote: {path.relative_to(ASSETS_DIR.parent.parent)}")


def append_log(log_path: Path, entry: str) -> None:
    date_str = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M")
    log_path.parent.mkdir(parents=True, exist_ok=True)
    with open(log_path, "a", encoding="utf-8") as f:
        f.write(f"\n## [{date_str}] {entry}\n")


def extract_pdf(path: Path) -> str:
    if HAS_PYPDF:
        reader = pypdf.PdfReader(str(path))
        return "\n\n".join(p.extract_text() or "" for p in reader.pages).strip()
    elif HAS_PDFPLUMBER:
        pages = []
        with pdfplumber.open(str(path)) as pdf:
            for page in pdf.pages:
                text = page.extract_text()
                if text:
                    pages.append(text)
        return "\n\n".join(pages)
    else:
        print(f"  WARNING: No PDF library. pip install pypdf")
        return f"[PDF: {path.name} — install pypdf to extract]"


def resource_id_from_filename(filename: str) -> str:
    """'R1.pdf' → 'R1', 'lecture_notes_r2.pdf' → 'R2'"""
    m = re.search(r"\bR(\d+)\b", filename, re.IGNORECASE)
    return f"R{m.group(1)}" if m else ""


# ══════════════════════════════════════════════════════════════════════════════
# Wiki pre-seeding from syllabus
# ══════════════════════════════════════════════════════════════════════════════

def preseed_module_pages(wiki_dir: Path, syllabus: Syllabus) -> None:
    """
    Create stub module pages from the syllabus before ingestion starts.
    These give the wiki a skeleton structure; ingest fills in the details.
    The LLM is explicitly told it can add content beyond the syllabus.
    """
    if not syllabus.modules:
        return

    print("Pre-seeding module structure from syllabus...")
    for module, lectures in syllabus.modules.items():
        slug = slugify(module)
        page_path = wiki_dir / "modules" / f"{slug}.md"
        if page_path.exists():
            continue  # don't overwrite existing module pages

        topic_list = "\n".join(
            f"- Lecture {l['lecture_number']}: [[{l['topic']}]]"
            for l in lectures
            if "Review" not in l["topic"] and "Wrap" not in l["topic"]
        )
        content = f"""# {module}

> This page is a syllabus-guided overview. Detailed concept pages are built
> from the lecture notes — they may cover topics beyond what the syllabus lists.

## Topics in this Module

{topic_list}

## Module Summary

_Built automatically from lecture notes. See individual topic pages for details._

## See Also

- [[Course Overview]]
"""
        write_file(page_path, content)
    print()


# ══════════════════════════════════════════════════════════════════════════════
# Core ingest
# ══════════════════════════════════════════════════════════════════════════════

def ingest_source(
    source_text: str,
    source_name: str,
    wiki_dir: Path,
    syllabus: Syllabus,
) -> list[str]:
    """
    Process one source file. Returns list of wiki page titles affected.

    The syllabus context is injected into every LLM prompt as GUIDANCE.
    The LLM is always told it can go beyond the syllabus.
    """
    res_id = resource_id_from_filename(source_name)
    syllabus_ctx = syllabus.resource_context(res_id) if res_id else ""

    # ── Step 1: Extract concepts ───────────────────────────────────────────────
    extraction_prompt = f"""Analyse this university lecture material and identify wiki pages to create or update.

{syllabus_ctx}

IMPORTANT: The syllabus above is a GUIDE only. You should ALSO identify any
additional concepts, algorithms, theorems, or techniques in the material that
deserve their own wiki page — even if not mentioned in the syllabus.
Think like a thorough textbook author: what would a student want to look up?

Return ONLY valid JSON (no markdown fences):
{{
  "entities": [
    {{
      "title": "Gradient Descent",
      "category": "concepts",
      "summary": "one sentence description",
      "from_syllabus": true
    }},
    {{
      "title": "Vanishing Gradient Problem",
      "category": "concepts",
      "summary": "discovered in material, not in syllabus",
      "from_syllabus": false
    }}
  ],
  "topic_title": "Short Topic Title",
  "topic_summary": "2-3 sentence summary of this source"
}}

Categories: "concepts" | "algorithms" | "theory" | "applications" | "modules"

MATERIAL ({source_name}):
{source_text[:5000]}"""

    raw = llm(SCHEMA_SYSTEM, extraction_prompt, max_tokens=1000)

    json_match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not json_match:
        print(f"  WARNING: Could not parse extraction for {source_name}")
        return []
    try:
        extracted = json.loads(json_match.group())
    except json.JSONDecodeError as e:
        print(f"  WARNING: JSON error for {source_name}: {e}")
        return []

    entities_raw = extracted.get("entities", [])
    entities = entities_raw if isinstance(entities_raw, list) else []

    topic_title_raw = extracted.get("topic_title", "")
    topic_summary_raw = extracted.get("topic_summary", "")
    topic_title = topic_title_raw.strip() if isinstance(topic_title_raw, str) else ""
    topic_summary = topic_summary_raw.strip() if isinstance(topic_summary_raw, str) else ""
    affected      = []

    # ── Step 2: Create/update entity pages ────────────────────────────────────
    for entity in entities[:6]:  # cap per source for speed
        if not isinstance(entity, dict):
            continue

        title_raw = entity.get("title", "")
        title = title_raw.strip() if isinstance(title_raw, str) else ""
        if not title:
            continue

        category_raw = entity.get("category", "concepts")
        category = category_raw if isinstance(category_raw, str) else "concepts"
        from_syllabus = entity.get("from_syllabus", False)
        slug      = slugify(title)
        page_path = wiki_dir / category / f"{slug}.md"

        existing  = read_file(page_path).strip() if page_path.exists() else ""
        action    = "Update" if existing else "Create"
        discovery = "" if from_syllabus else "\nNOTE: This concept was discovered in the material — it is NOT explicitly in the syllabus. Document it thoroughly anyway."

        page_prompt = f"""{action} a wiki page titled "{title}" for a machine learning course.
{discovery}

{syllabus_ctx}

{"Existing page content:" if existing else ""}
{existing[:1500] if existing else ""}

Source material ({source_name}) — relevant excerpt:
{source_text[:4000]}

Write a complete, thorough Markdown wiki page. Include:
# {title}
- Clear conceptual explanation (not just definition)
- Mathematical formulation if applicable (use plain text or LaTeX-style notation)
- Intuition / worked example
- Key properties or variants
- Common pitfalls students encounter
- ## See Also  with [[cross-reference links]]

{"Integrate new information with existing content. Mark contradictions with ⚠️." if existing else ""}
Output ONLY the Markdown. No preamble or explanation."""

        content = llm(SCHEMA_SYSTEM, page_prompt, max_tokens=1400)
        if not content.startswith("# "):
            content = f"# {title}\n\n{content}"
        write_file(page_path, content)
        affected.append(title)

    # ── Step 3: Topic summary page ─────────────────────────────────────────────
    if topic_title and "Review" not in topic_title:
        slug = slugify(topic_title)
        topic_path = wiki_dir / "topics" / f"{slug}.md"
        existing_topic = read_file(topic_path).strip() if topic_path.exists() else ""

        # Find the matching syllabus lecture for extra context
        matching_lectures = [
            lec for lec in syllabus.all_topics
            if any(kw.lower() in topic_title.lower() or topic_title.lower() in kw.lower()
                   for kw in [lec])
        ]

        topic_prompt = f"""{"Update" if existing_topic else "Create"} a topic summary page: "{topic_title}"

{syllabus_ctx}

Topic summary from source: {topic_summary}

{"Existing page:" if existing_topic else ""}
{existing_topic[:1200] if existing_topic else ""}

Full source material:
{source_text[:4500]}

Write a comprehensive topic page covering EVERYTHING relevant in the material.
Go beyond the syllabus subtopics if the source material contains more depth.

# {topic_title}
- Overview (2-3 paragraphs)
- Core concepts with [[wiki links]]
- Key algorithms or methods
- Connections to other course topics
- Student tips / common confusions
- ## See Also

Output ONLY the Markdown."""

        content = llm(SCHEMA_SYSTEM, topic_prompt, max_tokens=1500)
        if not content.startswith("# "):
            content = f"# {topic_title}\n\n{content}"
        write_file(topic_path, content)
        affected.append(topic_title)

    return affected


# ══════════════════════════════════════════════════════════════════════════════
# Module pages (post-ingest)
# ══════════════════════════════════════════════════════════════════════════════

def build_module_summaries(wiki_dir: Path, syllabus: Syllabus) -> None:
    """
    After all sources are ingested, ask the LLM to write a proper module
    summary page for each module — referencing actual wiki pages that were built.
    """
    if not syllabus.modules:
        return

    print("\nBuilding module summary pages...")
    # Collect all entity page titles for cross-referencing
    all_page_titles = []
    for md in wiki_dir.rglob("*.md"):
        if md.name in ("index.md", "log.md", "overview.md"):
            continue
        content = md.read_text(encoding="utf-8", errors="replace")
        m = re.search(r"^# (.+)$", content, re.MULTILINE)
        if m:
            all_page_titles.append(m.group(1))

    for module, lectures in syllabus.modules.items():
        slug = slugify(module)
        page_path = wiki_dir / "modules" / f"{slug}.md"

        mod_ctx = syllabus.module_context(module)
        relevant_pages = [t for t in all_page_titles
                          if any(kw.lower() in t.lower()
                                 for lec in lectures
                                 for kw in ([lec["topic"]] + lec["subtopics"]))][:20]

        prompt = f"""Write a comprehensive summary page for {module} of a machine learning course.

{mod_ctx}

Wiki pages already built that are relevant to this module:
{chr(10).join(f"  [[{t}]]" for t in relevant_pages) if relevant_pages else "  (none yet)"}

NOTE: The module may contain concepts discovered in the lecture notes that go
beyond the syllabus — include them if they appear in the existing wiki pages.

Write a thorough module overview page:
# {module}

Include:
- What this module covers and why it matters
- Core concepts (link to [[wiki pages]] liberally)
- How topics build on each other (learning progression)
- Key algorithms / methods in this module
- Self-check questions for students
- ## See Also  with links to related modules

Output ONLY the Markdown."""

        content = llm(SCHEMA_SYSTEM, prompt, max_tokens=1500)
        if not content.startswith("# "):
            content = f"# {module}\n\n{content}"
        write_file(page_path, content)


# ══════════════════════════════════════════════════════════════════════════════
# Index + overview
# ══════════════════════════════════════════════════════════════════════════════

def rebuild_index(wiki_dir: Path) -> int:
    """Scan all wiki pages and rebuild index.md with module-aware grouping."""
    pages_by_category: dict[str, list[tuple[str, str, str]]] = {}

    for md_file in sorted(wiki_dir.rglob("*.md")):
        if md_file.name in ("index.md", "log.md", "overview.md"):
            continue
        rel  = md_file.relative_to(wiki_dir)
        cat  = rel.parts[0] if len(rel.parts) > 1 else "root"
        text = md_file.read_text(encoding="utf-8", errors="replace")

        m = re.search(r"^# (.+)$", text, re.MULTILINE)
        title = m.group(1) if m else md_file.stem.replace("-", " ").title()

        summary = ""
        for line in text.split("\n"):
            line = line.strip()
            if line and not line.startswith("#") and not line.startswith("-") \
                    and not line.startswith(">") and not line.startswith("_"):
                summary = line[:120] + ("..." if len(line) > 120 else "")
                break

        pages_by_category.setdefault(cat, []).append((title, str(rel), summary))

    total = sum(len(v) for v in pages_by_category.values())

    # Category display order
    order = ["modules", "topics", "concepts", "algorithms", "theory", "applications"]
    sorted_cats = sorted(pages_by_category.keys(),
                         key=lambda c: order.index(c) if c in order else 99)

    lines = [
        "# Wiki Index\n\n",
        f"**{total} pages** | "
        f"_Updated: {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}_\n\n",
        "> Pages marked with ✨ cover content discovered beyond the course syllabus.\n\n",
    ]
    for cat in sorted_cats:
        pages = pages_by_category[cat]
        lines.append(f"\n## {cat.title()} ({len(pages)})\n\n")
        for title, path, summary in sorted(pages):
            lines.append(f"- [{title}]({path})")
            if summary:
                lines.append(f" — {summary}")
            lines.append("\n")

    index_path = wiki_dir / "index.md"
    index_path.parent.mkdir(parents=True, exist_ok=True)
    index_path.write_text("".join(lines), encoding="utf-8")
    print(f"  Index rebuilt: {total} pages")
    return total


def build_overview(wiki_dir: Path, course_title: str, syllabus: Syllabus) -> None:
    """Generate a high-level synthesis page using syllabus structure as a guide."""
    index_content = (wiki_dir / "index.md").read_text(encoding="utf-8") \
        if (wiki_dir / "index.md").exists() else ""

    syllabus_summary = syllabus.course_overview_context() if syllabus.modules else \
        "(no syllabus — structure derived purely from lecture notes)"

    prompt = f"""Write a comprehensive course overview page for "{course_title}".

COURSE SYLLABUS STRUCTURE (use as a guide, not a limit):
{syllabus_summary}

WIKI INDEX (pages already built from lecture notes):
{index_content[:3000]}

The wiki may contain pages on topics not in the syllabus — include them if relevant.

Write a rich overview page:
# Course Overview — {course_title}

Include:
- What machine learning is and why it matters
- Course structure (4 modules, how they connect)
- Prerequisites a student should have
- Suggested reading path through the wiki (link to [[pages]] liberally)
- The "big picture" — how the algorithms and theory fit together
- ## See Also

Output ONLY the Markdown."""

    content = llm(SCHEMA_SYSTEM, prompt, max_tokens=2000)
    if not content.startswith("# "):
        content = f"# Course Overview — {course_title}\n\n{content}"
    write_file(wiki_dir / "overview.md", content)


# ══════════════════════════════════════════════════════════════════════════════
# Lint
# ══════════════════════════════════════════════════════════════════════════════

def lint_wiki(wiki_dir: Path, syllabus: Syllabus) -> None:
    print("\n─── LINT ───────────────────────────────────────────")
    all_pages: dict[str, Path] = {}

    for md in wiki_dir.rglob("*.md"):
        text = md.read_text(encoding="utf-8", errors="replace")
        m = re.search(r"^# (.+)$", text, re.MULTILINE)
        if m:
            all_pages[m.group(1)] = md

    # Broken cross-references
    broken = []
    for title, path in all_pages.items():
        text = path.read_text(encoding="utf-8", errors="replace")
        for ref in re.findall(r"\[\[([^\]]+)\]\]", text):
            if ref not in all_pages:
                broken.append((title, ref))

    if broken:
        print(f"⚠  Broken [[links]] ({len(broken)}):")
        for pg, ref in broken[:15]:
            print(f"   {pg} → [[{ref}]]")
    else:
        print("✓  No broken cross-references")

    # Syllabus coverage check
    if syllabus.all_topics:
        covered = [t for t in syllabus.all_topics if t in all_pages]
        missing = [t for t in syllabus.all_topics if t not in all_pages and
                   "Review" not in t and "Wrap" not in t]
        print(f"✓  Syllabus topics with a wiki page : {len(covered)}/{len(syllabus.all_topics)}")
        if missing:
            print(f"   Topics without a dedicated page (may be covered inside other pages):")
            for t in missing[:10]:
                print(f"   - {t}")

    # Beyond-syllabus pages
    syllabus_topics_lower = {t.lower() for t in syllabus.all_topics + syllabus.all_subtopics}
    beyond = [t for t in all_pages
              if t not in ("index", "log", "overview")
              and not any(kw in t.lower() or t.lower() in kw for kw in syllabus_topics_lower)
              and not re.match(r"Module \d+", t)]
    if beyond:
        print(f"✨ Pages beyond the syllabus ({len(beyond)}) — discovered from lecture notes:")
        for t in beyond[:15]:
            print(f"   + {t}")

    print(f"\nTotal wiki pages: {len(all_pages)}")
    print("────────────────────────────────────────────────────")


# ══════════════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(
        description="Build LLM Wiki for a course (local GPU, syllabus-guided)")
    parser.add_argument("--model",        required=False, default=None,
                        help="Path to GGUF model file (not needed for --lint-only)")
    parser.add_argument("--course",       required=True,
                        help="Course directory name, e.g. machine-learning")
    parser.add_argument("--gpu-layers",   type=int, default=-1,
                        help="GPU layers to offload (-1 = all, default: -1)")
    parser.add_argument("--ctx",          type=int, default=4096,
                        help="Context window tokens (default: 4096)")
    parser.add_argument("--lint-only",    action="store_true",
                        help="Only lint the wiki (no LLM calls)")
    parser.add_argument("--overview-only",action="store_true",
                        help="Rebuild overview page only")
    parser.add_argument("--modules-only", action="store_true",
                        help="Rebuild module summary pages only")
    args = parser.parse_args()

    course_dir    = ASSETS_DIR / args.course
    raw_dir       = course_dir / "raw"
    wiki_dir      = course_dir / "wiki"
    log_path      = wiki_dir  / "log.md"
    manifest_path = course_dir / "manifest.json"
    syllabus_path = course_dir / "syllabus.csv"

    if not course_dir.exists():
        raise SystemExit(f"ERROR: Course not found: {course_dir}")

    manifest     = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    course_title = manifest.get("title", args.course)

    print(f"\nStudent AI — Wiki Builder (local GPU)")
    print(f"Course  : {course_title}")
    print(f"Wiki dir: {wiki_dir}\n")

    # Load syllabus (guide, not restriction)
    syllabus = Syllabus.load(syllabus_path)

    if args.lint_only:
        lint_wiki(wiki_dir, syllabus)
        return

    # Load local model (required for all non-lint operations)
    if not args.model:
        raise SystemExit("ERROR: --model is required (only omit for --lint-only)")
    load_model(args.model, args.gpu_layers, args.ctx)

    if args.overview_only:
        build_overview(wiki_dir, course_title, syllabus)
        return

    if args.modules_only:
        build_module_summaries(wiki_dir, syllabus)
        rebuild_index(wiki_dir)
        return

    # ── Pre-seed module structure from syllabus ────────────────────────────────
    preseed_module_pages(wiki_dir, syllabus)

    # ── Ingest all source files ────────────────────────────────────────────────
    source_files = sorted(
        list(raw_dir.glob("*.md"))  +
        list(raw_dir.glob("*.txt")) +
        list(raw_dir.glob("*.pdf"))
    ) if raw_dir.exists() else []

    if not source_files:
        raise SystemExit(f"ERROR: No source files found in {raw_dir}")

    print(f"Found {len(source_files)} source files\n")

    all_affected: list[str] = []
    for i, src in enumerate(source_files, 1):
        res_id = resource_id_from_filename(src.name)
        label  = f"{src.name}" + (f" [{res_id}]" if res_id else "")
        print(f"[{i}/{len(source_files)}] {label}")

        text = read_file(src)
        if not text.strip():
            print("  (empty, skipping)")
            continue

        affected = ingest_source(text, src.name, wiki_dir, syllabus)
        all_affected.extend(affected)

        syllabus_lectures = syllabus.resource_map.get(res_id, []) if res_id else []
        log_note = (f"syllabus topics: {len(syllabus_lectures)}" if syllabus_lectures
                    else "no syllabus mapping")
        append_log(log_path,
                   f"ingest | {src.name} | {len(affected)} pages | {log_note}")

    # ── Post-ingest: module summaries ──────────────────────────────────────────
    build_module_summaries(wiki_dir, syllabus)

    # ── Rebuild index + overview ───────────────────────────────────────────────
    print("\nRebuilding index...")
    total = rebuild_index(wiki_dir)

    print("Building overview...")
    build_overview(wiki_dir, course_title, syllabus)

    # ── Update manifest ────────────────────────────────────────────────────────
    manifest["wiki_page_count"] = total
    manifest["built_with"]      = Path(args.model).stem
    manifest["built_at"]        = datetime.datetime.utcnow().strftime("%Y-%m-%d")
    manifest["syllabus_guided"] = bool(syllabus.modules)
    write_file(manifest_path, json.dumps(manifest, indent=2))

    # ── Final lint ─────────────────────────────────────────────────────────────
    lint_wiki(wiki_dir, syllabus)
    append_log(log_path, f"build-complete | {total} pages | {len(source_files)} sources")

    print(f"\n✓ Wiki complete: {total} pages")
    print(f"  Lint:     python scripts/build-wiki.py --course {args.course} --lint-only")
    print(f"  Modules:  python scripts/build-wiki.py --model {args.model} "
          f"--course {args.course} --modules-only")


if __name__ == "__main__":
    main()
