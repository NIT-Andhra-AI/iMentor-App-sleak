"""
Per-concept lecture note generator — adapted from NIT-Andhra-AI/chatbot.
Replaced sglang_client with llm_client. Redis dependency removed (optional).
"""
import logging
from typing import List, Optional
from pydantic import BaseModel, Field

from course_gen import llm_client
from course_gen.config import NOTE_PARAMS, SCHEMA_PARAMS
from course_gen.concept_extractor import Concept, KnowledgeGraph

logger = logging.getLogger(__name__)


class MathFormula(BaseModel):
    label: str   = Field(description="Name of the formula or equation")
    latex: str   = Field(description="LaTeX string (no surrounding $$ delimiters)")
    meaning: str = Field(description="Plain-English explanation of each term")


class MathBlock(BaseModel):
    has_math: bool
    formulas: List[MathFormula] = Field(default_factory=list)


class Example(BaseModel):
    title:   str = Field(description="Short example title")
    content: str = Field(description="Step-by-step worked example in markdown")


class ConceptNote(BaseModel):
    concept:         str        = Field(description="Concept name")
    definition:      str        = Field(description="Precise 2-3 sentence definition")
    intuition:       str        = Field(description="2-3 paragraph explanation with analogies")
    math:            MathBlock
    mermaid_diagram: str        = Field(description="Valid mermaid code (no fences); empty if N/A")
    mermaid_caption: str        = Field(description="One-sentence diagram caption")
    examples:        List[Example]
    key_takeaways:   List[str]  = Field(description="3-5 bullet points students must remember")
    misconceptions:  List[str]  = Field(description="2-3 common wrong beliefs with corrections")
    connections:     List[str]  = Field(description="Related concept labels")


_NOTE_SYSTEM = (
    "You are a world-class university professor writing detailed lecture notes. "
    "Write clearly, use precise language, and include mathematical rigour where appropriate. "
    "Output valid JSON only."
)

_DIAGRAM_SYSTEM = (
    "You are a technical diagram expert. "
    "Generate clean, correct Mermaid diagram code. "
    "Return ONLY the raw mermaid code — no fences, no explanation."
)


def _note_prompt(
    concept: Concept,
    topic: str,
    all_labels: List[str],
    grounding_context: str = "",
) -> str:
    prereqs = ", ".join(concept.prerequisites) if concept.prerequisites else "none"
    related = ", ".join(l for l in all_labels if l != concept.label)
    source_block = (
        f"\nCOURSE SOURCE MATERIAL (use this to ground your notes):\n{grounding_context}\n"
        if grounding_context else ""
    )
    return (
        f"Write comprehensive lecture notes for this concept:\n\n"
        f"Concept: {concept.label}\n"
        f"In the context of: {topic}\n"
        f"Description: {concept.description}\n"
        f"Importance: {concept.importance}\n"
        f"Prerequisites: {prereqs}\n"
        f"Related concepts in this course: {related}\n"
        f"Involves math: {concept.has_math}\n"
        f"{source_block}\n"
        f"Requirements:\n"
        f"- definition: precise and complete\n"
        f"- intuition: build mental model, use analogies, 2-3 paragraphs\n"
        f"- math: include all relevant LaTeX formulas if has_math=true\n"
        f"- mermaid_diagram: ONE diagram illustrating structure or process (or empty string)\n"
        f"- examples: 1-2 concrete worked examples\n"
        f"- key_takeaways: what a student must leave knowing\n"
        f"- misconceptions: common wrong beliefs with corrections"
    )


def _diagram_prompt(concept_label: str, concept_desc: str) -> str:
    return (
        f'Create a Mermaid diagram that clearly illustrates: "{concept_label}"\n\n'
        f"Description: {concept_desc}\n\n"
        f"Rules:\n"
        f"- Use flowchart LR, graph TD, sequenceDiagram, classDiagram, or stateDiagram\n"
        f"- Keep it concise (≤15 nodes), labels ≤5 words\n"
        f"- Return ONLY the mermaid code, no fences"
    )


def _generate_mermaid(concept: Concept) -> str:
    """Fallback: generate mermaid diagram as plain text if structured note had empty diagram."""
    if not concept.has_math and concept.importance == "detail":
        return ""
    raw = llm_client.generate(
        system=_DIAGRAM_SYSTEM,
        user=_diagram_prompt(concept.label, concept.description),
        params={"temperature": 0.15, "max_tokens": 800},
    )
    if not raw:
        return ""
    raw = raw.strip()
    if raw.startswith("```"):
        lines = raw.splitlines()
        raw = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return raw.strip()


def generate_concept_note(
    concept: Concept,
    topic: str,
    all_labels: List[str],
    grounding_context: str = "",
) -> Optional[ConceptNote]:
    """Generate a full ConceptNote for one concept."""
    raw = llm_client.generate_structured(
        system=_NOTE_SYSTEM,
        user=_note_prompt(concept, topic, all_labels, grounding_context),
        schema_model=ConceptNote,
        schema_name="concept_note_schema",
        params=NOTE_PARAMS,
    )
    if raw is None:
        logger.warning("Note generation failed for concept: %s", concept.label)
        return None

    try:
        note = ConceptNote.model_validate(raw)
        if not note.mermaid_diagram and concept.importance in ("core", "supporting"):
            note.mermaid_diagram = _generate_mermaid(concept)
        return note
    except Exception as exc:
        logger.error("ConceptNote validation failed for '%s': %s", concept.label, exc)
        return None


def generate_all_notes(kg: KnowledgeGraph) -> List[tuple]:
    """
    Generate notes for every concept in the knowledge graph.
    Returns list of (Concept, ConceptNote | None), core concepts first.
    """
    all_labels = [c.label for c in kg.concepts]
    ordered = sorted(
        kg.concepts,
        key=lambda c: {"core": 0, "supporting": 1, "detail": 2}.get(c.importance, 1),
    )

    results = []
    for i, concept in enumerate(ordered, 1):
        logger.info("[%d/%d] Generating notes: %s (%s)", i, len(ordered), concept.label, concept.importance)
        note = generate_concept_note(concept, kg.title, all_labels)
        results.append((concept, note))

    return results
