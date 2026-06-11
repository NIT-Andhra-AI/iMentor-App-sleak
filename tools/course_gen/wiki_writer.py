"""
Wiki markdown writer — converts ConceptNote objects into wiki pages
compatible with the Student AI WikiLoader (crates/wiki).

Output format per page:
  # Concept Label
  > excerpt sentence

  ## Definition
  ...
  ## Intuition
  ...
  ## Key Formulas        (if has_math)
  ...
  ## Diagram             (if mermaid_diagram)
  ...
  ## Examples
  ...
  ## Key Takeaways
  ...
  ## Common Misconceptions
  ...
  ## Related Concepts
  ...
"""
import json
import logging
import os
import re
from typing import List, Optional, Tuple

from course_gen.concept_extractor import Concept, KnowledgeGraph
from course_gen.note_writer import ConceptNote

logger = logging.getLogger(__name__)


def _slug(text: str) -> str:
    """Convert a concept label to a filesystem-safe slug."""
    text = text.lower().strip()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_]+", "-", text)
    return text[:60]


def _render_page(concept: Concept, note: ConceptNote) -> str:
    """Render a ConceptNote as a wiki markdown page."""
    lines = []

    # H1 title — required by WikiPage.extract_h1_title()
    lines.append(f"# {note.concept}")
    lines.append("")

    # Excerpt callout
    first_sentence = note.definition.split(".")[0].strip()
    lines.append(f"> {first_sentence}.")
    lines.append("")

    # Definition
    lines.append("## Definition")
    lines.append("")
    lines.append(note.definition)
    lines.append("")

    # Intuition
    lines.append("## Intuition")
    lines.append("")
    lines.append(note.intuition)
    lines.append("")

    # Math formulas
    if note.math.has_math and note.math.formulas:
        lines.append("## Key Formulas")
        lines.append("")
        for formula in note.math.formulas:
            lines.append(f"**{formula.label}**")
            lines.append("")
            lines.append(f"$$\n{formula.latex}\n$$")
            lines.append("")
            lines.append(f"*{formula.meaning}*")
            lines.append("")

    # Mermaid diagram
    if note.mermaid_diagram:
        lines.append("## Diagram")
        lines.append("")
        lines.append("```mermaid")
        lines.append(note.mermaid_diagram)
        lines.append("```")
        if note.mermaid_caption:
            lines.append("")
            lines.append(f"*{note.mermaid_caption}*")
        lines.append("")

    # Examples
    if note.examples:
        lines.append("## Examples")
        lines.append("")
        for ex in note.examples:
            lines.append(f"### {ex.title}")
            lines.append("")
            lines.append(ex.content)
            lines.append("")

    # Key takeaways
    if note.key_takeaways:
        lines.append("## Key Takeaways")
        lines.append("")
        for pt in note.key_takeaways:
            lines.append(f"- {pt}")
        lines.append("")

    # Misconceptions
    if note.misconceptions:
        lines.append("## Common Misconceptions")
        lines.append("")
        for m in note.misconceptions:
            lines.append(f"- {m}")
        lines.append("")

    # Related concepts
    if note.connections:
        lines.append("## Related Concepts")
        lines.append("")
        for conn in note.connections:
            lines.append(f"- {conn}")
        lines.append("")

    # Footer: importance tag
    lines.append(f"---")
    lines.append(f"*Importance: {concept.importance}*")
    lines.append("")

    return "\n".join(lines)


def _render_overview(kg: KnowledgeGraph) -> str:
    """Render the course overview page from the knowledge graph."""
    lines = [
        f"# {kg.title}",
        "",
        kg.summary,
        "",
        "## Learning Objectives",
        "",
    ]
    for obj in kg.learning_objectives:
        lines.append(f"- {obj}")
    lines.append("")

    # Concept index table
    lines.append("## Concept Index")
    lines.append("")
    lines.append("| Concept | Importance | Has Math |")
    lines.append("|---------|-----------|----------|")
    for c in kg.concepts:
        math_marker = "✓" if c.has_math else ""
        lines.append(f"| {c.label} | {c.importance} | {math_marker} |")
    lines.append("")

    return "\n".join(lines)


def write_wiki(
    course_id: str,
    kg: KnowledgeGraph,
    notes: List[Tuple[Concept, Optional[ConceptNote]]],
    courses_dir: str,
    overwrite: bool = False,
) -> dict:
    """
    Write wiki pages to assets/courses/{course_id}/wiki/.
    Returns a manifest dict describing all written pages.

    Args:
        course_id:    e.g. "machine-learning"
        kg:           KnowledgeGraph from concept_extractor
        notes:        List of (Concept, ConceptNote | None) from note_writer
        courses_dir:  Path to assets/courses/
        overwrite:    Whether to overwrite existing wiki pages

    Returns:
        manifest dict (written to manifest.json)
    """
    wiki_dir = os.path.join(courses_dir, course_id, "wiki")
    os.makedirs(wiki_dir, exist_ok=True)

    manifest_path = os.path.join(courses_dir, course_id, "manifest.json")

    pages = []
    skipped = 0
    written = 0

    # Overview page
    overview_path = os.path.join(wiki_dir, "overview.md")
    if overwrite or not os.path.exists(overview_path):
        with open(overview_path, "w", encoding="utf-8") as f:
            f.write(_render_overview(kg))
        written += 1
        logger.info("Wrote overview.md")

    pages.append({
        "id": "overview",
        "title": kg.title,
        "file": "wiki/overview.md",
        "importance": "core",
        "type": "overview",
    })

    # Per-concept pages
    for concept, note in notes:
        slug = _slug(concept.label)
        filename = f"{slug}.md"
        page_path = os.path.join(wiki_dir, filename)

        if not overwrite and os.path.exists(page_path):
            logger.info("Skipping (exists): %s", filename)
            skipped += 1
        else:
            if note is not None:
                content = _render_page(concept, note)
            else:
                # Minimal fallback page if note generation failed
                content = (
                    f"# {concept.label}\n\n"
                    f"{concept.description}\n\n"
                    f"*Note: Detailed content generation failed for this concept.*\n"
                )
            with open(page_path, "w", encoding="utf-8") as f:
                f.write(content)
            written += 1
            if note:
                logger.info("Wrote: %s", filename)
            else:
                logger.warning("Wrote fallback page: %s", filename)

        pages.append({
            "id": slug,
            "title": concept.label,
            "file": f"wiki/{filename}",
            "importance": concept.importance,
            "has_math": concept.has_math,
            "type": "concept",
        })

    # Update manifest
    manifest = {
        "course_id": course_id,
        "title": kg.title,
        "summary": kg.summary,
        "page_count": len(pages),
        "pages": pages,
        "generated_by": "course_gen (llama-cpp-python adapter)",
    }
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    logger.info(
        "Wiki complete: %d pages written, %d skipped → %s",
        written, skipped, wiki_dir
    )
    return manifest
