"""
wiki_parser.py — Python equivalent of crates/wiki (page.rs + loader.rs + search.rs)

Parses course wiki markdown files into structured dicts that match the Rust
WikiPage schema.  Used by the server to serve pre-parsed wiki content as JSON
so the Tauri runtime contract is not required (useful for web dashboards,
admin tooling, and the Python course pipeline).

Exported public API
-------------------
    parse_page(wiki_root, file_path) -> WikiPageDict
    load_course(course_dir)          -> list[WikiPageDict]
    find_wiki_pages(wiki_dir)        -> list[Path]
    search(pages, query, top_k)      -> list[dict]   # BM25-style
"""
from __future__ import annotations

import json
import math
import re
from collections import Counter
from pathlib import Path
from typing import Optional


# ── YAML frontmatter helpers ──────────────────────────────────────────────────

_FM_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n?", re.DOTALL)


def _strip_frontmatter(content: str) -> tuple[str, dict]:
    """Return (body_without_frontmatter, frontmatter_dict)."""
    m = _FM_RE.match(content)
    if not m:
        return content, {}
    body = content[m.end():]
    fm: dict = {}
    for line in m.group(1).splitlines():
        if ":" not in line:
            continue
        key, _, val = line.partition(":")
        key = key.strip()
        val = val.strip().strip('"').strip("'")
        # Parse YAML lists: [a, b, c]
        if val.startswith("[") and val.endswith("]"):
            val = [v.strip().strip('"').strip("'") for v in val[1:-1].split(",") if v.strip()]  # type: ignore[assignment]
        fm[key] = val
    return body, fm


# ── Markdown → plain-text stripping ──────────────────────────────────────────
# Mirrors the Rust pulldown-cmark strip_markdown() logic as closely as possible.

# Patterns applied in order
_FENCE_RE      = re.compile(r"```[^\n]*\n.*?```", re.DOTALL)          # fenced code blocks
_INDENT_CODE   = re.compile(r"(?m)^(    |\t).+$")                     # indented code
_HTML_TAG_RE   = re.compile(r"<[^>]+>")                               # HTML tags
_FRONTMATTER   = re.compile(r"^---\s*\n.*?\n---\s*\n?", re.DOTALL)   # YAML frontmatter
_HEADING_RE    = re.compile(r"(?m)^#{1,6}\s+")                        # heading hashes
_BLOCKQUOTE_RE = re.compile(r"(?m)^>\s?")                             # blockquote >
_HRULE_RE      = re.compile(r"(?m)^[-*_]{3,}\s*$")                    # thematic breaks
_BOLD_ITAL_RE  = re.compile(r"\*{1,3}|_{1,3}")                        # bold / italic markers
_LINK_RE       = re.compile(r"!?\[([^\]]*)\]\([^\)]*\)")              # [text](url) / ![alt](url)
_WIKI_LINK_RE  = re.compile(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]")        # [[WikiLink|alias]]
_TABLE_SEP_RE  = re.compile(r"(?m)^\|[-|: ]+\|\s*$")                  # table separator row
_TABLE_CELL_RE = re.compile(r"\|")                                     # table cell divider
_INLINE_CODE   = re.compile(r"`[^`]+`")                               # `inline code`
_MULTI_NL_RE   = re.compile(r"\n{3,}")                                 # excess blank lines
_MATH_DISPLAY  = re.compile(r"\$\$.*?\$\$", re.DOTALL)               # $$…$$
_MATH_INLINE   = re.compile(r"\$[^\$\n]+\$")                          # $…$
_DEMO_FENCE    = re.compile(r":::demo.*?:::", re.DOTALL)              # :::demo…:::


def strip_markdown(content: str) -> str:
    """Convert markdown to plain text preserving word boundaries."""
    text = content

    # Remove demo fences first (custom extension)
    text = _DEMO_FENCE.sub(" ", text)

    # Remove YAML frontmatter
    text = _FRONTMATTER.sub("", text)

    # Replace math with placeholder so adjacent words aren't merged
    text = _MATH_DISPLAY.sub(" [formula] ", text)
    text = _MATH_INLINE.sub(" [formula] ", text)

    # Remove fenced code blocks — preserve content as plain text
    def _code_block(m: re.Match) -> str:
        code = m.group(0)
        # Strip the fence lines, keep the code body for indexing
        lines = code.split("\n")[1:-1]
        return "\n".join(lines)

    text = _FENCE_RE.sub(_code_block, text)

    # Remove HTML tags
    text = _HTML_TAG_RE.sub("", text)

    # Headings → plain text (just remove the #s)
    text = _HEADING_RE.sub("", text)

    # Blockquotes → plain text
    text = _BLOCKQUOTE_RE.sub("", text)

    # Thematic breaks → newline
    text = _HRULE_RE.sub("\n", text)

    # Links / images → text content only
    text = _LINK_RE.sub(r"\1", text)
    text = _WIKI_LINK_RE.sub(r"\1", text)

    # Inline code → raw text
    text = _INLINE_CODE.sub(lambda m: m.group(0)[1:-1], text)

    # Remove table separator rows
    text = _TABLE_SEP_RE.sub("", text)

    # Table cells → space-separated
    text = _TABLE_CELL_RE.sub(" ", text)

    # Bold/italic markers
    text = _BOLD_ITAL_RE.sub("", text)

    # Collapse excess whitespace
    text = _MULTI_NL_RE.sub("\n\n", text)

    return text.strip()


# ── H1 title extractor ────────────────────────────────────────────────────────

_H1_RE = re.compile(r"(?m)^#\s+(.+)$")


def extract_h1_title(content: str) -> Optional[str]:
    m = _H1_RE.search(content)
    if m:
        # Strip any inline markdown from the title text
        title = m.group(1).strip()
        title = _BOLD_ITAL_RE.sub("", title)
        title = _LINK_RE.sub(r"\1", title)
        title = _INLINE_CODE.sub(lambda x: x.group(0)[1:-1], title)
        return title.strip() or None
    return None


# ── WikiPage dict ─────────────────────────────────────────────────────────────

WikiPageDict = dict  # title, file_name, content, plain_text, excerpt, word_count, frontmatter


def parse_page(wiki_root: Path, file_path: Path) -> WikiPageDict:
    """
    Parse a single wiki markdown file.

    Returns a dict matching the Rust WikiPage schema plus a 'frontmatter' key
    with the parsed YAML metadata.
    """
    content = file_path.read_text(encoding="utf-8", errors="replace")

    # Relative path (forward slashes, like the Rust impl)
    try:
        rel = file_path.relative_to(wiki_root).as_posix()
    except ValueError:
        rel = file_path.name

    body, frontmatter = _strip_frontmatter(content)

    # Title: prefer frontmatter > first H1 > filename stem
    title: str = (
        frontmatter.get("title")
        or extract_h1_title(body)
        or extract_h1_title(content)
        or " ".join(w.capitalize() for w in file_path.stem.replace("-", " ").split())
    )

    plain_text = strip_markdown(content)
    excerpt = plain_text[:300]
    word_count = len(plain_text.split())

    return {
        "slug": file_path.stem,
        "title": title,
        "file_name": rel,
        "content": content,
        "plain_text": plain_text,
        "excerpt": excerpt,
        "word_count": word_count,
        "frontmatter": frontmatter,
    }


# ── Loader (matches crates/wiki/src/loader.rs) ────────────────────────────────

def find_wiki_pages(wiki_dir: Path) -> list[Path]:
    """
    Recursively find all .md files under wiki_dir.
    Excludes index.md and log.md at the wiki root (mirrors Rust loader).
    Sorted lexicographically for deterministic order.
    """
    root = wiki_dir.resolve()
    exclude_at_root = {"index.md", "log.md"}
    paths: list[Path] = []

    for p in root.rglob("*.md"):
        if p.parent.resolve() == root and p.name in exclude_at_root:
            continue
        paths.append(p)

    paths.sort()
    return paths


def load_course(course_dir: Path) -> list[WikiPageDict]:
    """
    Load all wiki pages for a course directory (contains manifest.json + wiki/).
    Returns an empty list if wiki/ does not exist.
    """
    wiki_dir = course_dir / "wiki"
    if not wiki_dir.exists():
        return []

    pages = []
    for fp in find_wiki_pages(wiki_dir):
        try:
            pages.append(parse_page(wiki_dir, fp))
        except Exception:
            pass  # skip unreadable files silently (mirrors Rust behaviour)
    return pages


def load_manifest(course_dir: Path) -> dict:
    manifest_path = course_dir / "manifest.json"
    if not manifest_path.exists():
        return {}
    try:
        return json.loads(manifest_path.read_text(encoding="utf-8"))
    except Exception:
        return {}


# ── BM25-style full-text search (matches crates/wiki/src/search.rs intent) ───

def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-z0-9]+", text.lower())


class _BM25Index:
    """Minimal BM25 index over a list of WikiPageDicts."""

    K1 = 1.5
    B  = 0.75

    def __init__(self, pages: list[WikiPageDict]) -> None:
        self.pages = pages
        self._tf: list[Counter] = []
        self._dl: list[int] = []

        for page in pages:
            tokens = _tokenize(page["plain_text"])
            self._tf.append(Counter(tokens))
            self._dl.append(len(tokens))

        self._avgdl = sum(self._dl) / max(len(self._dl), 1)
        self._N = len(pages)

        # Document frequency per term
        self._df: Counter = Counter()
        for tf in self._tf:
            for term in tf:
                self._df[term] += 1

    def score(self, doc_idx: int, query_terms: list[str]) -> float:
        tf = self._tf[doc_idx]
        dl = self._dl[doc_idx]
        score = 0.0
        for term in query_terms:
            if term not in tf:
                continue
            df = self._df.get(term, 0)
            idf = math.log((self._N - df + 0.5) / (df + 0.5) + 1)
            freq = tf[term]
            numerator = freq * (self.K1 + 1)
            denominator = freq + self.K1 * (1 - self.B + self.B * dl / self._avgdl)
            score += idf * numerator / denominator
        return score

    def query(self, text: str, top_k: int = 10) -> list[dict]:
        terms = _tokenize(text)
        scored = [(i, self.score(i, terms)) for i in range(self._N)]
        scored.sort(key=lambda x: -x[1])
        results = []
        for idx, sc in scored[:top_k]:
            if sc <= 0:
                break
            page = self.pages[idx]
            results.append({
                "slug": page["slug"],
                "title": page["title"],
                "excerpt": page["excerpt"],
                "score": round(sc, 4),
            })
        return results


# Public search helper
def search(pages: list[WikiPageDict], query: str, top_k: int = 10) -> list[dict]:
    """BM25 full-text search over pre-loaded pages."""
    index = _BM25Index(pages)
    return index.query(query, top_k=top_k)
