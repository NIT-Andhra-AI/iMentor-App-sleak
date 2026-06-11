#!/usr/bin/env python3
"""
Gemini Agentic Course Builder for Student AI
=============================================

Each course is built by a Gemini CLI agent session (--yolo mode) that:
  1. Searches the web for syllabi from top universities (MIT, Stanford, CMU,
     Berkeley, IIT Bombay, IIT Madras, IIT Delhi, Caltech, Oxford, etc.)
  2. Synthesizes a master lecture-by-lecture curriculum from those syllabi
  3. Generates comprehensive interactive wiki pages for every topic/subtopic
  4. Writes all files directly to assets/courses/{id}/wiki/

Pages produced per topic:
  • Concept definition + intuition + LaTeX math
  • Mermaid architecture/flow diagram
  • Complete runnable code example (Python/C++/Verilog/Qiskit)
  • Worked step-by-step example
  • Industry applications (real companies)
  • Practice problems  Easy → Medium → Hard with hints
  • 3 MCQ quiz questions with explanations
  • 4 placement interview Q&A pairs
  • Key takeaways + common misconceptions

Usage (from project root):
    python tools/course_gen/gemini_build_courses.py
    python tools/course_gen/gemini_build_courses.py --course-id quantum-computing
    python tools/course_gen/gemini_build_courses.py --list-courses
    python tools/course_gen/gemini_build_courses.py --enhance-existing
    python tools/course_gen/gemini_build_courses.py --course-id machine-learning --overwrite
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

# ── Path setup ────────────────────────────────────────────────────────────────
_THIS_DIR  = Path(__file__).parent.resolve()
_TOOLS_DIR = _THIS_DIR.parent
sys.path.insert(0, str(_THIS_DIR))
sys.path.insert(0, str(_TOOLS_DIR))

try:
    import gemini_client
except ImportError:
    from course_gen import gemini_client  # type: ignore

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-8s %(name)s — %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("gemini_build_courses")

REPO_ROOT   = Path(__file__).parent.parent.parent.resolve()
COURSES_DIR = REPO_ROOT / "assets" / "courses"

# ── Course catalogue ──────────────────────────────────────────────────────────

@dataclass
class CourseSpec:
    id:                 str
    title:              str
    description:        str
    tags:               List[str]
    placement_domains:  List[str]
    difficulty:         str
    # Universities whose syllabi the agent should research
    universities:       List[str]
    # Additional search queries beyond the default ones
    extra_queries:      List[str] = field(default_factory=list)
    # Hint topics for the agent (it may find more via syllabus research)
    seed_topics:        List[str] = field(default_factory=list)
    # Code language preference
    code_lang:          str = "python"


ALL_COURSES: List[CourseSpec] = [
    # ── 7 NEW COURSES ──────────────────────────────────────────────────────
    CourseSpec(
        id="artificial-intelligence",
        title="Artificial Intelligence",
        description=(
            "Foundations of AI: search algorithms, knowledge representation, "
            "planning, probabilistic reasoning, NLP, and intelligent agents. "
            "Placement-focused with FAANG-level interview preparation."
        ),
        tags=["ai", "search", "planning", "nlp", "agents", "placement"],
        placement_domains=["AI Engineer", "ML Engineer", "Research Scientist", "NLP Engineer"],
        difficulty="intermediate",
        universities=[
            "MIT (6.034 Artificial Intelligence)",
            "Stanford (CS221 Artificial Intelligence: Principles and Techniques)",
            "UC Berkeley (CS188 Introduction to Artificial Intelligence)",
            "CMU (15-381 Artificial Intelligence: Representation and Problem Solving)",
            "IIT Bombay (CS747 Foundations of Intelligent and Learning Agents)",
            "Caltech (CS156 Learning Systems)",
        ],
        extra_queries=[
            "artificial intelligence syllabus lecture notes site:ocw.mit.edu",
            "CS221 stanford ai course schedule site:stanford.edu",
            "CS188 berkeley ai syllabus site:cs188.berkeley.edu",
        ],
        seed_topics=[
            "overview", "search-algorithms", "informed-search", "adversarial-search",
            "constraint-satisfaction", "knowledge-representation", "propositional-logic",
            "first-order-logic", "bayesian-networks", "markov-decision-processes",
            "natural-language-processing", "transformer-architecture", "intelligent-agents",
            "interview-prep",
        ],
        code_lang="python",
    ),

    CourseSpec(
        id="deep-learning",
        title="Deep Learning",
        description=(
            "Neural architectures from perceptrons to transformers, GANs, diffusion models, "
            "and large language models. Covers training, optimization, and deployment for "
            "real-world AI engineering roles."
        ),
        tags=["deep-learning", "neural-networks", "transformers", "llm", "cv", "placement"],
        placement_domains=["Deep Learning Engineer", "AI Researcher", "Computer Vision Engineer", "NLP Engineer"],
        difficulty="advanced",
        universities=[
            "Stanford (CS231n Convolutional Neural Networks for Visual Recognition)",
            "Stanford (CS224n Natural Language Processing with Deep Learning)",
            "deeplearning.ai (Deep Learning Specialization by Andrew Ng)",
            "fast.ai (Practical Deep Learning for Coders)",
            "CMU (11-785 Introduction to Deep Learning)",
            "MIT (6.S191 Introduction to Deep Learning)",
            "IIT Madras (CS6910 Deep Learning)",
        ],
        extra_queries=[
            "CS231n stanford syllabus site:cs231n.stanford.edu",
            "MIT 6.S191 deep learning schedule site:introtodeeplearning.com",
            "CMU 11-785 deep learning schedule site:deeplearning.cs.cmu.edu",
        ],
        seed_topics=[
            "overview", "neural-network-fundamentals", "backpropagation",
            "optimization-algorithms", "regularization", "convolutional-neural-networks",
            "recurrent-neural-networks", "lstm-gru", "attention-mechanism",
            "transformer-architecture", "bert-gpt-llms", "generative-adversarial-networks",
            "diffusion-models", "transfer-learning-finetuning", "interview-prep",
        ],
        code_lang="python",
    ),

    CourseSpec(
        id="software-engineering",
        title="Software Engineering",
        description=(
            "SDLC, design patterns, system design, agile, testing, clean code, "
            "microservices, and cloud architecture — the complete playbook for "
            "software engineering roles at top product companies."
        ),
        tags=["software-engineering", "system-design", "design-patterns", "agile", "placement"],
        placement_domains=["Software Engineer", "Backend Engineer", "Solutions Architect", "SDE-2/3"],
        difficulty="intermediate",
        universities=[
            "MIT (6.031 Software Construction)",
            "Stanford (CS169 Software Engineering)",
            "CMU (17-313 Foundations of Software Engineering)",
            "UC Berkeley (CS169 Software Engineering)",
            "IIT Delhi (COL331 Software Engineering)",
            "IIT Bombay (CS615 Software Engineering)",
        ],
        extra_queries=[
            "software engineering syllabus design patterns site:ocw.mit.edu",
            "system design interview curriculum google microsoft amazon",
            "SOLID principles design patterns software engineering curriculum",
        ],
        seed_topics=[
            "overview", "sdlc-models", "requirements-engineering", "uml-and-modeling",
            "solid-principles", "creational-patterns", "structural-patterns",
            "behavioral-patterns", "system-design-fundamentals", "scalability-caching-cdn",
            "database-design", "microservices-architecture", "rest-and-api-design",
            "testing-strategies", "agile-scrum", "devops-cicd", "interview-prep",
        ],
        code_lang="python",
    ),

    CourseSpec(
        id="quantum-computing",
        title="Quantum Computing",
        description=(
            "Quantum mechanics foundations, qubits, quantum gates, entanglement, "
            "Grover's and Shor's algorithms, quantum error correction, and quantum ML. "
            "Prepares students for emerging quantum software/hardware roles."
        ),
        tags=["quantum-computing", "qubits", "algorithms", "qml", "qiskit", "placement"],
        placement_domains=["Quantum Software Engineer", "Research Scientist", "Quantum Algorithm Designer"],
        difficulty="advanced",
        universities=[
            "MIT (8.370 / 18.435J Quantum Computation)",
            "Caltech (Ph219 / CS219 Quantum Computing)",
            "Stanford (CS269Q Elements of Quantum Computer Programming)",
            "Berkeley (CS294 Quantum Computing)",
            "IIT Bombay (EE735 Quantum Information and Computing)",
            "University of Waterloo (QIC 710 Quantum Information Processing)",
        ],
        extra_queries=[
            "MIT 8.370 quantum computation syllabus site:ocw.mit.edu",
            "Caltech Ph219 quantum computing notes site:preskill.caltech.edu",
            "qiskit quantum computing curriculum IBM",
        ],
        seed_topics=[
            "overview", "quantum-mechanics-foundations", "qubits-superposition-bloch-sphere",
            "quantum-gates-circuits", "quantum-entanglement-bell-states",
            "quantum-measurement", "deutschs-jozsa-algorithm", "grovers-algorithm",
            "quantum-fourier-transform", "shors-algorithm", "quantum-error-correction",
            "variational-quantum-algorithms", "quantum-machine-learning",
            "qiskit-programming", "interview-prep",
        ],
        code_lang="python",  # Qiskit is Python
    ),

    CourseSpec(
        id="vlsi-design",
        title="VLSI Design",
        description=(
            "CMOS fundamentals, RTL design with Verilog/VHDL, synthesis, timing analysis, "
            "physical design, and FPGA implementation. Built from IIT/top ECE department "
            "syllabi for semiconductor and hardware engineering placements."
        ),
        tags=["vlsi", "cmos", "verilog", "hdl", "fpga", "digital-design", "placement"],
        placement_domains=["VLSI Design Engineer", "RTL Engineer", "Physical Design Engineer", "FPGA Engineer"],
        difficulty="advanced",
        universities=[
            "IIT Madras (EC5670 VLSI Design)",
            "IIT Bombay (EE671 VLSI Design)",
            "IIT Delhi (ELL412 VLSI Design)",
            "Stanford (EE271 Introduction to VLSI Systems)",
            "MIT (6.004 Computation Structures / 6.374 VLSI)",
            "CMU (18-340 Logic Design and Verification)",
            "University of Michigan (EECS 427 VLSI Design I)",
        ],
        extra_queries=[
            "VLSI design syllabus verilog HDL site:nptel.ac.in",
            "IIT VLSI design lecture notes CMOS site:iitm.ac.in",
            "digital VLSI design curriculum stanford MIT",
        ],
        seed_topics=[
            "overview", "cmos-technology-fundamentals", "cmos-inverter-analysis",
            "combinational-cmos-circuits", "sequential-circuits-latches-flipflops",
            "verilog-hdl-syntax", "rtl-design-methodology", "finite-state-machines",
            "logic-synthesis", "static-timing-analysis", "physical-design-flow",
            "fpga-architecture-programming", "low-power-design-techniques",
            "memory-design", "interview-prep",
        ],
        code_lang="verilog",
    ),

    CourseSpec(
        id="robotics",
        title="Robotics and Autonomous Systems",
        description=(
            "Robot kinematics/dynamics, path planning, SLAM, computer vision, "
            "ROS2, sensor fusion, PID control, and RL for robotics. "
            "Covers both industrial automation and autonomous vehicle pipelines."
        ),
        tags=["robotics", "kinematics", "slam", "ros", "autonomous", "control", "placement"],
        placement_domains=["Robotics Engineer", "Autonomous Systems Engineer", "Controls Engineer", "Computer Vision Engineer"],
        difficulty="advanced",
        universities=[
            "MIT (6.832 Underactuated Robotics)",
            "Stanford (CS223A Introduction to Robotics)",
            "CMU (16-311 Introduction to Robotics)",
            "UC Berkeley (CS287 Advanced Robotics)",
            "IIT Bombay (ME604 Robotics)",
            "ETH Zurich (Robotics course)",
        ],
        extra_queries=[
            "Stanford CS223A robotics syllabus site:cs.stanford.edu",
            "MIT 6.832 underactuated robotics schedule site:underactuated.csail.mit.edu",
            "CMU robotics course schedule site:cs.cmu.edu",
            "ROS2 robotics curriculum autonomous vehicles",
        ],
        seed_topics=[
            "overview", "robot-kinematics", "denavit-hartenberg-parameters",
            "inverse-kinematics", "robot-dynamics", "pid-control-systems",
            "trajectory-planning", "path-planning-rrt-prm", "slam",
            "computer-vision-for-robotics", "sensor-fusion-kalman-filter",
            "ros2-fundamentals", "reinforcement-learning-for-robotics",
            "autonomous-vehicle-architecture", "interview-prep",
        ],
        code_lang="python",
    ),

    CourseSpec(
        id="dsa-placement",
        title="Data Structures & Algorithms for Placements",
        description=(
            "Comprehensive DSA for FAANG and top-tier placement preparation. "
            "Pattern-based approach covering arrays, trees, graphs, DP, greedy, "
            "with curated problems and interview strategies from actual placement drives."
        ),
        tags=["dsa", "algorithms", "placement", "leetcode", "competitive-programming", "interviews"],
        placement_domains=["SDE-1/SDE-2", "Software Engineer", "Product Engineer", "Quant Dev"],
        difficulty="intermediate",
        universities=[
            "MIT (6.006 Introduction to Algorithms)",
            "Stanford (CS161 Design and Analysis of Algorithms)",
            "CMU (15-451 Algorithm Design and Analysis)",
            "IIT Bombay (CS213 Data Structures and Algorithms)",
            "IIT Delhi (COL106 Data Structures and Algorithms)",
            "Coursera / Princeton (Algorithms by Sedgewick and Wayne)",
        ],
        extra_queries=[
            "MIT 6.006 algorithms syllabus site:ocw.mit.edu",
            "Stanford CS161 algorithms schedule site:cs161.stanford.edu",
            "FAANG interview DSA topics frequency guide",
            "LeetCode top patterns dynamic programming trees graphs",
        ],
        seed_topics=[
            "overview", "arrays-and-strings", "two-pointers-sliding-window",
            "linked-lists", "stacks-and-queues", "recursion-and-backtracking",
            "binary-trees", "binary-search-trees", "heaps-and-priority-queues",
            "hash-tables", "graphs-bfs-dfs", "shortest-paths-dijkstra-bellman-ford",
            "dynamic-programming-fundamentals", "dp-patterns-advanced",
            "greedy-algorithms", "binary-search", "bit-manipulation",
            "interview-prep",
        ],
        code_lang="python",
    ),

    # ── ENHANCEMENTS TO EXISTING COURSES ───────────────────────────────────
    CourseSpec(
        id="machine-learning",
        title="Machine Learning Fundamentals",
        description="Enhanced with deep learning, MLOps, and placement-focused interview content.",
        tags=["machine-learning", "ai", "data-science", "placement"],
        placement_domains=["ML Engineer", "Data Scientist", "AI Researcher"],
        difficulty="intermediate",
        universities=[
            "Stanford (CS229 Machine Learning by Andrew Ng)",
            "CMU (10-701 Machine Learning)",
            "Berkeley (CS189 Introduction to Machine Learning)",
        ],
        extra_queries=["CS229 stanford machine learning syllabus site:cs229.stanford.edu"],
        seed_topics=["placement-guide", "coding-lab-sklearn", "system-design-ml", "interview-prep"],
        code_lang="python",
    ),

    CourseSpec(
        id="data-structures",
        title="Data Structures",
        description="Enhanced with interview problems, complexity cheatsheet, and placement guide.",
        tags=["data-structures", "algorithms", "cs-core", "placement"],
        placement_domains=["SDE", "Software Engineer"],
        difficulty="beginner",
        universities=["MIT (6.006)", "Stanford (CS161)", "IIT Bombay (CS213)"],
        extra_queries=[],
        seed_topics=["placement-guide", "complexity-cheatsheet", "interview-prep"],
        code_lang="python",
    ),

    CourseSpec(
        id="algorithms",
        title="Algorithms",
        description="Enhanced with competitive programming patterns and placement guide.",
        tags=["algorithms", "competitive-programming", "placement"],
        placement_domains=["SDE", "Competitive Programmer"],
        difficulty="intermediate",
        universities=["MIT (6.006)", "Stanford (CS161)", "CMU (15-451)"],
        extra_queries=[],
        seed_topics=["placement-guide", "interview-prep"],
        code_lang="python",
    ),

    CourseSpec(
        id="compiler-design",
        title="Compiler Design",
        description="Lexical analysis, parsing, semantic analysis, intermediate code, optimization, and code generation.",
        tags=["compiler", "programming-languages", "systems", "placement"],
        placement_domains=["Systems Engineer", "Language Engineer", "SDE"],
        difficulty="advanced",
        universities=["Stanford (CS143)", "MIT (6.035)", "IIT Bombay (CS316)"],
        extra_queries=[],
        seed_topics=["overview", "lexical-analysis", "syntax-analysis", "parsing", "semantic-analysis",
                     "intermediate-code", "code-optimization", "code-generation", "symbol-table"],
        code_lang="python",
    ),

    CourseSpec(
        id="computer-networks",
        title="Computer Networks",
        description="OSI model, TCP/IP, routing, transport layer, application protocols, and network security.",
        tags=["networking", "protocols", "systems", "placement"],
        placement_domains=["Network Engineer", "SDE", "DevOps"],
        difficulty="intermediate",
        universities=["Stanford (CS144)", "MIT (6.829)", "NPTEL"],
        extra_queries=[],
        seed_topics=["overview", "osi-model", "tcp-ip", "transport-layer", "routing",
                     "subnetting", "dns-dhcp", "http-https", "network-security"],
        code_lang="python",
    ),

    CourseSpec(
        id="computer-organization",
        title="Computer Organization & Architecture",
        description="CPU architecture, pipelining, memory hierarchy, cache, I/O systems, and RISC vs CISC.",
        tags=["computer-architecture", "hardware", "systems", "placement"],
        placement_domains=["Hardware Engineer", "Systems Engineer", "SDE"],
        difficulty="intermediate",
        universities=["CMU (18-447)", "MIT (6.004)", "IIT Bombay (CS226)"],
        extra_queries=[],
        seed_topics=["overview", "cpu-architecture", "instruction-set", "pipelining",
                     "memory-hierarchy", "cache-memory", "buses", "io-systems", "risc-cisc"],
        code_lang="c",
    ),

    CourseSpec(
        id="database-management",
        title="Database Management Systems",
        description="Relational model, SQL, normalization, transactions, indexing, query optimization, and NoSQL.",
        tags=["databases", "sql", "systems", "placement"],
        placement_domains=["Database Engineer", "Backend Engineer", "SDE"],
        difficulty="intermediate",
        universities=["UC Berkeley (CS186)", "Stanford (CS245)", "IIT Bombay (CS317)"],
        extra_queries=[],
        seed_topics=["overview", "relational-model", "sql-basics", "er-diagrams",
                     "normalization", "indexing", "transactions", "query-optimization", "nosql"],
        code_lang="sql",
    ),

    CourseSpec(
        id="digital-logic",
        title="Digital Logic Design",
        description="Boolean algebra, logic gates, combinational/sequential circuits, FSM, and memory elements.",
        tags=["digital-logic", "hardware", "vlsi", "placement"],
        placement_domains=["Hardware Engineer", "VLSI Engineer", "Embedded Systems"],
        difficulty="beginner",
        universities=["MIT (6.004)", "Georgia Tech (ECE2020)", "IIT Bombay (EE214)"],
        extra_queries=[],
        seed_topics=["overview", "number-systems", "boolean-algebra", "logic-gates",
                     "combinational-circuits", "flip-flops", "sequential-circuits", "fsm", "memory-circuits"],
        code_lang="verilog",
    ),

    CourseSpec(
        id="object-oriented-programming",
        title="Object-Oriented Programming",
        description="OOP principles, classes, inheritance, polymorphism, design patterns, and SOLID principles.",
        tags=["oop", "java", "python", "design-patterns", "placement"],
        placement_domains=["SDE", "Software Engineer", "Backend Engineer"],
        difficulty="beginner",
        universities=["MIT (6.009)", "Stanford (CS106B)", "IIT Bombay (CS101)"],
        extra_queries=[],
        seed_topics=["overview", "classes-objects", "encapsulation", "inheritance",
                     "polymorphism", "abstraction", "exception-handling", "design-patterns", "solid-principles"],
        code_lang="python",
    ),

    CourseSpec(
        id="operating-systems",
        title="Operating Systems",
        description="Processes, threads, scheduling, synchronization, deadlock, memory management, and file systems.",
        tags=["operating-systems", "systems", "concurrency", "placement"],
        placement_domains=["Systems Engineer", "SDE", "Kernel Developer"],
        difficulty="advanced",
        universities=["MIT (6.004)", "Stanford (CS140)", "UC Berkeley (CS162)", "IIT Bombay (CS347)"],
        extra_queries=[],
        seed_topics=["overview", "processes", "threads", "scheduling", "synchronization",
                     "deadlock", "memory-management", "virtual-memory", "file-systems"],
        code_lang="c",
    ),
]

# ── Agent prompt builder ──────────────────────────────────────────────────────

_PAGE_FORMAT = """
Each wiki page MUST follow this exact markdown structure (fill every section — no placeholders):

```
# <Topic Title>

> One precise, memorable sentence defining this topic.

## Overview
(2-3 paragraphs: formal definition, scope, historical context, why it matters)

## Visual Intuition

(Search Wikipedia or Wikimedia Commons for a relevant animated GIF that illustrates this concept.
 Use the DIRECT image URL from upload.wikimedia.org or a stable CDN.
 Embed it as:  ![Alt text describing the animation](https://upload.wikimedia.org/...)
 If no GIF is available, use a static diagram image.
 Always add a *caption* below the image in italics.)

## Core Theory
(Deep technical explanation with sub-sections. Include LaTeX math using $inline$ and $$block$$ notation
wherever equations apply.)

## Visual Diagram
```mermaid
(A meaningful diagram — flowchart, sequence, class, or state diagram that matches the theory)
```
*Caption describing what the diagram shows*

## Code Example
```<LANG>
# Complete, runnable, well-commented code with expected output as comments
# Include: imports, step-by-step computation, print statements showing results
```

## Interactive Demo
:::demo
<!-- title: <Descriptive title e.g. "Bubble Sort Step Visualizer"> -->
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin:0; background:#0f1117; color:#e5e7eb; font-family: system-ui, sans-serif; font-size:13px; padding:12px; }
  /* Include all necessary CSS inline */
</style>
</head>
<body>
<!-- Self-contained interactive visualization using only vanilla HTML/CSS/JavaScript.
     NO external libraries. Animate the core concept (algorithm steps, data flow, etc.)
     with play/pause/step controls where appropriate.
     Examples:
       - Sorting: animated array bars with step-by-step
       - BST/Trees: animated node insertion
       - Neural nets: forward pass animation with weights shown
       - Quantum gates: qubit state visualization
       - FSM: state machine transitions
       - Graph algos: BFS/DFS traversal animation -->
<script>
  // All JavaScript inline. No external dependencies.
  // Use requestAnimationFrame for smooth animations.
</script>
</body>
</html>
:::

## Worked Example
(Step-by-step walkthrough of a concrete problem — show ALL intermediate steps with numerical values)

## Industry Applications
- **Company/Domain**: How this concept is used in production (3-4 real examples with company names)

## Practice Problems

### Easy
1. [Problem statement] *(Hint: ...)*

### Medium
2. [Problem statement] *(Hint: ...)*
3. [Problem statement] *(Hint: ...)*

### Hard
4. [Problem statement] *(Hint: ...)*

## Interview Questions

List common and tough interview questions only (no answers, no hints).
Include at least 8 questions spanning:
- fundamentals
- derivations/complexity
- edge-cases
- system design / real-world tradeoffs

## Key Takeaways
- (5-7 must-remember bullet points)

## Common Misconceptions
- ❌ [Wrong belief] → ✅ [Correct understanding]
- ❌ [Wrong belief] → ✅ [Correct understanding]

## Related Topics
- [<Topic Title>](<topic-slug>.md) — [Brief relationship description]
(3-4 cross-references to other topics in this course)
```
"""

_MANIFEST_FORMAT = """
manifest.json format (IMPORTANT: include "topics" array for sidebar navigation):
{
  "id": "<course-id>",
  "title": "<Course Title>",
  "version": "2.0.0",
  "description": "<description>",
  "wiki_page_count": <N>,
  "built_with": "gemini-2.5-pro / gemini-2.5-flash (agentic, syllabus-driven)",
  "built_at": "<YYYY-MM-DD>",
  "tags": [...],
  "placement_domains": [...],
  "difficulty": "<level>",
  "interactive": true,
    "has_quizzes": false,
  "has_code_examples": true,
  "has_interview_prep": true,
  "has_demos": true,
  "has_gifs": true,
  "syllabus_sources": ["<university1>", "<university2>", ...],
  "topics": [
    {
      "title": "<Section Name e.g. Foundations>",
      "pages": [
        {"slug": "<slug>", "title": "<Page Title>", "type": "concept"},
        {"slug": "<slug>", "title": "<Page Title>", "type": "code"},
        {"slug": "<slug>", "title": "<Page Title>", "type": "interview"}
      ]
    },
    {
      "title": "<Next Section>",
      "pages": [...]
    }
  ]
}

Page types: "concept" | "code" | "practice" | "interview" | "overview"
Group related pages into meaningful section titles (e.g. "Foundations", "Core Algorithms", "Advanced Topics", "Interview Prep")
"""


def build_agent_prompt(course: CourseSpec, wiki_dir: Path, overwrite: bool = False) -> str:
    """Build the comprehensive agent prompt for a full course generation."""

    existing = []
    if wiki_dir.exists() and not overwrite:
        existing = [f.stem for f in wiki_dir.glob("*.md")]

    skip_note = ""
    if existing and not overwrite:
        skip_note = f"\nNOTE: These pages already exist — SKIP generating them: {', '.join(existing)}\n"

    uni_list  = "\n".join(f"  - {u}" for u in course.universities)
    seed_list = "\n".join(f"  - {t}" for t in course.seed_topics)
    today     = __import__("datetime").date.today().isoformat()

    return f"""You are an expert curriculum designer and professor building a world-class interactive course wiki.

## MISSION
Build a complete, university-grade, placement-focused wiki for: **{course.title}**
Target roles: {', '.join(course.placement_domains)}
Difficulty: {course.difficulty}
Code language: {course.code_lang}

## OUTPUT DIRECTORY
All files go here: `{wiki_dir}`
Create the directory if it doesn't exist.
{skip_note}

## STEP 1 — RESEARCH UNIVERSITY SYLLABI
Search the web for syllabi and lecture schedules from these top institutions:
{uni_list}

Additional search queries to use:
{chr(10).join(f"  - {q}" for q in course.extra_queries) or "  - (use default search queries)"}

For each university found:
- Note the exact lecture titles and their order
- Note the subtopics covered within each lecture
- Note any lab/programming assignments
- Note recommended textbooks

IMPORTANT: Use the actual syllabi content as the BACKBONE for this course structure.
The syllabus topics define WHAT gets covered; you decide HOW DEEPLY to cover it.

## STEP 2 — SYNTHESIZE MASTER CURRICULUM
After researching, synthesize a master topic list that:
1. Covers ALL major topics appearing in 2+ university syllabi
2. Sequences topics from foundational → advanced (respect prerequisites)
3. Covers at minimum these seed topics (add MORE from your research):
{seed_list}

Before generating pages, write a file `{wiki_dir / "syllabus_research.json"}` containing:
{{
  "course": "{course.id}",
  "sources_found": ["<university1>: <URL or title>", ...],
  "master_topics": [
    {{"slug": "<slug>", "title": "<Title>", "source_universities": ["<uni>"], "week": <N>}}
  ]
}}

## STEP 3 — GENERATE ALL WIKI PAGES
For EVERY topic in your master curriculum, create a file at:
`{wiki_dir}/<topic-slug>.md`

{_PAGE_FORMAT}

Requirements:
- Code examples must be COMPLETE and RUNNABLE (not pseudocode)
- Math formulas must be proper LaTeX
- Mermaid diagrams must be valid mermaid syntax
- Interview questions must reflect ACTUAL patterns from FAANG/top Indian tech interviews
- Practice problems should escalate Easy → Medium → Hard
- Cross-references use standard markdown links: [topic title](topic-slug.md)
- Do not print YAML frontmatter keys/values as plain text in page body
- Each page must be SUBSTANTIAL (at minimum 600 words of actual content)

## STEP 4 — GENERATE INDEX
Write `{wiki_dir / "index.md"}`:
```markdown
# {course.title} — Wiki Index

> {course.description}

**Target Roles:** {', '.join(course.placement_domains)} | **Difficulty:** {course.difficulty}

## Topics
(Table: | # | Topic | Importance | Code | Interview |)
(One row per topic with checkmarks)

## Recommended Study Order
(Ordered list with time estimates)

## Tags
{' '.join(f'`{t}`' for t in course.tags)}
```

## STEP 5 — WRITE MANIFEST
Write `{wiki_dir.parent / "manifest.json"}`:
{_MANIFEST_FORMAT}
Use today's date: {today}
Include all page slugs in the "pages" array.
Include the actual university URLs you found in "syllabus_sources".

## QUALITY CHECKLIST (verify before finishing)
- [ ] Every seed topic has a page
- [ ] Every page has a real GIF/image from Wikipedia or Wikimedia embedded with direct URL
- [ ] Every page has a Mermaid diagram (valid mermaid syntax)
- [ ] Every page has a complete runnable code example in {course.code_lang}
- [ ] Every page has a :::demo block with a self-contained interactive HTML/JS visualization
- [ ] No quiz/MCQ blocks are generated
- [ ] Every page has an interview-questions section with questions only (no answers)
- [ ] Every page has Easy/Medium/Hard practice problems
- [ ] manifest.json has a "topics" array (not just "pages") structured as:
      {{"topics": [{{"title": "Section Name", "pages": [{{"slug":"...", "title":"...", "type":"..."}}]}}]}}
- [ ] manifest.json page count matches actual files created
- [ ] All cross-reference markdown links point to real slugs in this course

START NOW. Research, synthesize, then generate ALL pages. Do not ask for confirmation — complete the entire task autonomously."""


# ── Model strategy ────────────────────────────────────────────────────────────
#
# Two-tier cascade:
#
#  Tier 1 — Gemini CLI (free, OAuth quota, no API key cost)
#    gemini-2.5-pro   → gemini-2.5-flash → gemini-2.0-flash
#
#  Tier 2 — Gemini API key (GEMINI_API_KEY env var, separate quota pool)
#    Same model order, but CLI uses the provided key instead of OAuth.
#    Activated automatically when Tier 1 exhausts its daily quota
#    (TerminalQuotaError / QUOTA_EXHAUSTED, not just capacity spikes).
#
# Within each model: up to _MAX_RETRIES_PER_MODEL attempts with back-off.
# rc=1 with no new pages written = hard quota/error → cascade immediately.
# rc=1 with new pages written    = stopped mid-run → cascade to write more.
#
_MODEL_CASCADE = [
    "gemini-2.5-pro",    # highest quality — try first
    "gemini-2.5-flash",  # fast + capable — primary fallback
    "gemini-1.5-flash",  # stable fallback with broad API availability
]
_MAX_RETRIES_PER_MODEL = 2     # retries per model before cascade to next
_RETRY_BASE_DELAY      = 60    # seconds; doubles each retry (60 → 120)

# API key injected into env when CLI OAuth quota is exhausted
_GEMINI_API_KEY = "AIzaSyAwtMnjyTcSqGOiodZ2fxTO3b8STMmnHa0"


def _run_agent(
    prompt: str,
    course_id: str,
    timeout: int = 2400,
    preferred_model: Optional[str] = None,
) -> bool:
    """
    Launch a Gemini CLI agent session (--yolo) to autonomously build the course.

    Two-tier model cascade:
      Tier 1 (CLI OAuth quota): pro → flash → 2.0-flash
      Tier 2 (API key quota):   pro → flash → 2.0-flash  (GEMINI_API_KEY set)

    On rc=1 the cascade checks whether new pages were written in this run:
      • No new pages  → hard quota/error, cascade to next model immediately
      • Some new pages → stopped mid-run, cascade to continue with next model

    Returns True if any pages were written (even partial completion).
    """
    exe = gemini_client._find_gemini_exe()
    if not exe:
        logger.error("Gemini CLI not found — cannot run agent")
        return False

    npm_dir   = Path(exe).parent
    gemini_js = npm_dir / "node_modules" / "@google" / "gemini-cli" / "bundle" / "gemini.js"
    if not gemini_js.exists():
        logger.error("gemini.js bundle not found at: %s", gemini_js)
        return False

    # Write the full prompt to a file so the agent reads it autonomously
    course_dir  = COURSES_DIR / course_id
    course_dir.mkdir(parents=True, exist_ok=True)
    prompt_file = course_dir / ".agent_prompt.md"
    prompt_file.write_text(prompt, encoding="utf-8")

    short_prompt = (
        f"Read the file at this exact path and execute every instruction in it: "
        f"{prompt_file.as_posix()}"
    )

    # Build ordered model list with preferred model first
    if preferred_model and preferred_model not in _MODEL_CASCADE:
        cascade = [preferred_model] + _MODEL_CASCADE
    elif preferred_model:
        cascade = [preferred_model] + [m for m in _MODEL_CASCADE if m != preferred_model]
    else:
        cascade = list(_MODEL_CASCADE)

    wiki_dir   = COURSES_DIR / course_id / "wiki"
    any_success = False

    def _pages_now() -> int:
        return len(list(wiki_dir.glob("*.md"))) if wiki_dir.exists() else 0

    def _attempt(model: str, env: dict, label: str, attempt_num: int) -> str:
        """Run one agent attempt. Returns 'success' | 'cascade' | 'retry'."""
        pages_before = _pages_now()
        logger.info(
            "🚀 [%s] %s attempt %d/%d — course: %s",
            label, model, attempt_num, _MAX_RETRIES_PER_MODEL, course_id,
        )
        try:
            result = subprocess.run(
                ["node", str(gemini_js), "-m", model, "--yolo", "-p", short_prompt],
                stdout=None,
                stderr=None,
                timeout=timeout,
                env={**os.environ, **env},
            )
            pages_after  = _pages_now()
            new_pages    = pages_after - pages_before
            logger.info("   pages before=%d after=%d new=%d rc=%d", pages_before, pages_after, new_pages, result.returncode)

            if result.returncode == 0:
                return "success"

            if result.returncode == 1:
                if new_pages > 0:
                    # Made progress but stopped (capacity spike mid-run) — cascade to continue
                    logger.warning("⚠️  rc=1 (%s) — wrote %d new pages, cascading to continue", model, new_pages)
                    return "cascade"
                else:
                    # No progress at all — hard quota/error
                    logger.warning("⚠️  rc=1 (%s) — no new pages, hard quota/error", model)
                    return "cascade" if attempt_num >= _MAX_RETRIES_PER_MODEL else "retry"

            # Any other rc
            return "cascade"

        except subprocess.TimeoutExpired:
            logger.error("⏰ Timeout (%ds) on %s [%s]", timeout, model, label)
            return "cascade"
        except Exception as exc:
            logger.error("Exception on %s [%s]: %s", model, label, exc)
            return "cascade"

    # ── Tier 1: CLI OAuth quota (no API key) ──────────────────────────────────
    logger.info("📡 Tier 1 — CLI OAuth quota (no API key cost)")
    for model_idx, model in enumerate(cascade):
        for attempt in range(1, _MAX_RETRIES_PER_MODEL + 1):
            outcome = _attempt(model, {}, "OAuth", attempt)
            if outcome == "success":
                any_success = True
                break
            elif outcome == "retry":
                delay = _RETRY_BASE_DELAY * (2 ** (attempt - 1))
                logger.info("   Retrying in %ds …", delay)
                time.sleep(delay)
            else:  # cascade
                break
        if any_success:
            break
        if model_idx < len(cascade) - 1:
            wait = 30
            logger.info("⏳ Switching %s → %s in %ds …", model, cascade[model_idx + 1], wait)
            time.sleep(wait)

    if any_success:
        # Clean up and return
        try: prompt_file.unlink(missing_ok=True)
        except OSError: pass
        return True

    # ── Tier 2: API key quota (separate pool) ─────────────────────────────────
    logger.info("🔑 Tier 1 exhausted — switching to Tier 2 (GEMINI_API_KEY)")
    api_env = {"GEMINI_API_KEY": _GEMINI_API_KEY}

    for model_idx, model in enumerate(cascade):
        for attempt in range(1, _MAX_RETRIES_PER_MODEL + 1):
            outcome = _attempt(model, api_env, "API-key", attempt)
            if outcome == "success":
                any_success = True
                break
            elif outcome == "retry":
                delay = _RETRY_BASE_DELAY * (2 ** (attempt - 1))
                logger.info("   Retrying in %ds …", delay)
                time.sleep(delay)
            else:
                break
        if any_success:
            break
        if model_idx < len(cascade) - 1:
            wait = 30
            logger.info("⏳ Switching %s → %s in %ds …", model, cascade[model_idx + 1], wait)
            time.sleep(wait)

    if not any_success:
        # Last resort: pages may have been written even without "success"
        any_success = _pages_now() > 0
        if any_success:
            logger.warning("⚠️  All tiers exhausted but %d pages exist — treating as partial success", _pages_now())
        else:
            logger.error("❌ All tiers exhausted and no pages written for: %s", course_id)

    try: prompt_file.unlink(missing_ok=True)
    except OSError: pass
    return any_success


def build_course(course: CourseSpec, overwrite: bool = False) -> bool:
    """Build a course using a Gemini CLI agent session."""
    wiki_dir   = COURSES_DIR / course.id / "wiki"
    wiki_dir.mkdir(parents=True, exist_ok=True)

    logger.info("")
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
    logger.info("  Building: %s", course.title)
    logger.info("  ID:       %s", course.id)
    logger.info("  Topics:   %d seed topics + more from syllabus research", len(course.seed_topics))
    logger.info("  Universities: %s", " | ".join(u.split("(")[0].strip() for u in course.universities[:4]))
    logger.info("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")

    prompt = build_agent_prompt(course, wiki_dir, overwrite=overwrite)
    success = _run_agent(prompt, course.id, preferred_model="gemini-2.5-pro")

    if success:
        # Quick verification
        pages = list(wiki_dir.glob("*.md"))
        manifest = COURSES_DIR / course.id / "manifest.json"
        logger.info(
            "  ✅ %s: %d pages written, manifest=%s",
            course.id, len(pages), "✓" if manifest.exists() else "✗"
        )
    else:
        logger.warning("  ⚠️  %s: agent did not complete cleanly", course.id)

    return success


def build_all(
    overwrite: bool = False,
    new_only: bool = False,
    enhance_only: bool = False,
) -> None:
    """Build all courses in sequence."""
    new_ids     = {c.id for c in ALL_COURSES if not (COURSES_DIR / c.id).exists() or overwrite}
    enhance_ids = {"machine-learning", "data-structures", "algorithms"}

    courses = []
    if not enhance_only:
        courses += [c for c in ALL_COURSES if c.id not in enhance_ids]
    if not new_only:
        courses += [c for c in ALL_COURSES if c.id in enhance_ids]

    logger.info("Building %d courses …", len(courses))

    for i, course in enumerate(courses, 1):
        logger.info("\n[%d/%d] %s", i, len(courses), course.title)
        build_course(course, overwrite=overwrite)
        if i < len(courses):
            logger.info("Pausing 90s before next course (rate-limit cooldown) …")
            time.sleep(90)

    logger.info("\n🎉 All done! Courses built: %d", len(courses))


# ── CLI ───────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build syllabus-driven interactive courses with Gemini CLI agents.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Build everything
  python tools/course_gen/gemini_build_courses.py

  # Single course
  python tools/course_gen/gemini_build_courses.py --course-id quantum-computing

  # Only new courses (skip enhancements)
  python tools/course_gen/gemini_build_courses.py --new-only

  # Only enhance existing courses
  python tools/course_gen/gemini_build_courses.py --enhance-existing

  # Overwrite existing pages
  python tools/course_gen/gemini_build_courses.py --course-id deep-learning --overwrite
        """,
    )
    parser.add_argument("--course-id",        help="Build a single course by ID")
    parser.add_argument("--overwrite",        action="store_true", help="Overwrite existing pages")
    parser.add_argument("--new-only",         action="store_true", help="Only build new courses")
    parser.add_argument("--enhance-existing", action="store_true", help="Only enhance existing courses")
    parser.add_argument("--list-courses",     action="store_true", help="List catalogue and exit")
    parser.add_argument("--health-check",     action="store_true", help="Check Gemini CLI and exit")
    parser.add_argument("--print-prompt",     help="Print the agent prompt for a course ID and exit")
    args = parser.parse_args()

    if args.health_check:
        h = gemini_client.check_health()
        print("\nGemini Health Check:")
        for k, v in h.items():
            print(f"  {k:<25}: {v}")
        return

    if args.list_courses:
        print("\n📚 Course Catalogue:\n")
        enhance_ids = {"machine-learning", "data-structures", "algorithms"}
        for c in ALL_COURSES:
            exists = (COURSES_DIR / c.id).exists()
            tag    = "🔄 enhance" if c.id in enhance_ids else "🆕 new"
            tick   = "✅" if exists else "⬜"
            print(f"  {tick} {tag} | {c.id:<45} {c.title}")
        return

    if args.print_prompt:
        matched = [c for c in ALL_COURSES if c.id == args.print_prompt]
        if not matched:
            print(f"Unknown course: {args.print_prompt}")
            sys.exit(1)
        wiki_dir = COURSES_DIR / matched[0].id / "wiki"
        print(build_agent_prompt(matched[0], wiki_dir))
        return

    # Single course
    if args.course_id:
        matched = [c for c in ALL_COURSES if c.id == args.course_id]
        if not matched:
            logger.error("Unknown course id: %s", args.course_id)
            logger.info("Run --list-courses to see available IDs")
            sys.exit(1)
        build_course(matched[0], overwrite=args.overwrite)
        return

    # Batch
    build_all(
        overwrite=args.overwrite,
        new_only=args.new_only,
        enhance_only=args.enhance_existing,
    )


if __name__ == "__main__":
    main()
