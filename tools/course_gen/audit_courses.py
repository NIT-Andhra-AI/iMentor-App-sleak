#!/usr/bin/env python3
"""Audit all course wiki pages for interactive elements and frontmatter."""
import re
from pathlib import Path

COURSES_DIR = Path(__file__).parent.parent.parent / "assets" / "courses"

totals = dict(pages=0, gif=0, demo=0, mermaid=0, quiz=0, fm=0)
rows = []

for course in sorted(COURSES_DIR.iterdir()):
    wiki = course / "wiki"
    if not wiki.exists():
        continue
    pages = [p for p in wiki.glob("*.md") if p.name not in ("index.md", "log.md")]
    n = len(pages)
    c = dict(gif=0, demo=0, mermaid=0, quiz=0, fm=0)
    for p in pages:
        text = p.read_text(encoding="utf-8", errors="ignore")
        if re.search(r"!\[.*?\]\(https?://.*?\.gif", text) or "data:image/gif;base64," in text:
            c["gif"] += 1
        if ":::demo" in text:
            c["demo"] += 1
        if "```mermaid" in text:
            c["mermaid"] += 1
        if ":::quiz" in text:
            c["quiz"] += 1
        if text.startswith("---"):
            c["fm"] += 1
    rows.append((course.name, n, c))
    totals["pages"] += n
    for k in ("gif", "demo", "mermaid", "quiz", "fm"):
        totals[k] += c[k]

header = f"{'Course':<38} {'Pgs':>4} {'GIF':>4} {'Demo':>4} {'Mmd':>4} {'Quiz':>4} {'FM':>4}"
print(header)
print("-" * len(header))
for name, n, c in rows:
    print(f"{name:<38} {n:>4} {c['gif']:>4} {c['demo']:>4} {c['mermaid']:>4} {c['quiz']:>4} {c['fm']:>4}")
print("-" * len(header))
p = totals["pages"]
print(f"{'TOTAL':<38} {p:>4} {totals['gif']:>4} {totals['demo']:>4} {totals['mermaid']:>4} {totals['quiz']:>4} {totals['fm']:>4}")
print()
print(f"Coverage:  GIF={totals['gif']/p*100:.0f}%  Demo={totals['demo']/p*100:.0f}%  Mermaid={totals['mermaid']/p*100:.0f}%  Quiz={totals['quiz']/p*100:.0f}%  Frontmatter={totals['fm']/p*100:.0f}%")
