import os, re, json, zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Header, Depends, Query
from fastapi.responses import FileResponse

from api.models import CourseCatalogEntry
from api.database import get_db

# Python wiki parser — mirrors crates/wiki logic server-side
import sys as _sys
_sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from wiki_parser import parse_page as _parse_page, load_course as _load_course, search as _wiki_search

router = APIRouter(prefix="/v1/courses", tags=["courses"])

BUNDLES_DIR = Path(__file__).parent.parent.parent / "course_bundles"
BUNDLES_DIR.mkdir(exist_ok=True)

ADMIN_KEY = os.environ.get("ADMIN_API_KEY", "")

APP_ROOT = Path(__file__).resolve().parents[3]
LOCAL_COURSES_DIR = APP_ROOT / "assets" / "courses"

# Only allow safe course IDs: lowercase letters, digits, and hyphens.
_SAFE_COURSE_ID = re.compile(r'^[a-z0-9][a-z0-9\-]{0,63}$')


def _require_admin(x_admin_key: Optional[str] = Header(default=None)):
    if not ADMIN_KEY or ADMIN_KEY == "change-me-in-production":
        raise HTTPException(status_code=503, detail="Admin API disabled: ADMIN_API_KEY not configured")
    if x_admin_key != ADMIN_KEY:
        raise HTTPException(status_code=403, detail="Invalid admin key")


def _local_course_dir(course_id: str) -> Path:
    course_dir = LOCAL_COURSES_DIR / course_id
    if not course_dir.joinpath("manifest.json").exists():
        raise HTTPException(status_code=404, detail=f"Course '{course_id}' not found")
    return course_dir


# ── Local compatibility endpoints (admin/debug tooling only) ────────────────
# These endpoints are intentionally outside the student runtime contract.
# Student runtime features must use Tauri commands in src-tauri/src/commands.

@router.get("/local")
async def list_local_courses():
    if not LOCAL_COURSES_DIR.exists():
        return []

    out = []
    for course_dir in sorted(LOCAL_COURSES_DIR.iterdir()):
        if not course_dir.is_dir():
            continue
        manifest_path = course_dir / "manifest.json"
        if not manifest_path.exists():
            continue
        try:
            m = json.loads(manifest_path.read_text(encoding="utf-8"))
        except Exception:
            continue
        out.append({
            "id": m.get("id", course_dir.name),
            "title": m.get("title", course_dir.name),
            "description": m.get("description", ""),
            "wiki_page_count": int(m.get("wiki_page_count", 0) or 0),
            "version": m.get("version", "1.0.0"),
            "is_downloaded": False,
            "removed": False,
        })

    out.sort(key=lambda c: c["title"].lower())
    return out


@router.get("/local/{course_id}/manifest")
async def get_local_manifest(course_id: str):
    course_dir = _local_course_dir(course_id)
    try:
        return json.loads((course_dir / "manifest.json").read_text(encoding="utf-8"))
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not read manifest: {exc}")


@router.get("/local/{course_id}/wiki/{page_slug}")
async def get_local_wiki_page(course_id: str, page_slug: str):
    course_dir = _local_course_dir(course_id)
    page_path = course_dir / "wiki" / f"{page_slug}.md"
    if not page_path.exists():
        raise HTTPException(status_code=404, detail=f"Page not found: {page_slug}")
    return FileResponse(
        path=str(page_path),
        media_type="text/markdown; charset=utf-8",
        filename=f"{page_slug}.md",
    )


@router.get("/local/{course_id}/pages")
async def list_local_wiki_pages(course_id: str):
    course_dir = _local_course_dir(course_id)
    wiki_dir = course_dir / "wiki"
    if not wiki_dir.exists():
        return []
    slugs = sorted(p.stem for p in wiki_dir.glob("*.md") if p.stem != "index")
    return slugs


# ── Parsed-JSON wiki endpoints (Python wiki_parser — no Tauri required) ──────

@router.get("/local/{course_id}/parsed/{page_slug}")
async def get_local_wiki_page_parsed(course_id: str, page_slug: str):
    """
    Return a wiki page as structured JSON (title, slug, content, plain_text,
    excerpt, word_count, frontmatter) parsed by the Python wiki_parser.
    Equivalent to the Rust WikiPage struct — usable by web dashboards and
    admin tooling without the Tauri runtime.
    """
    # Validate slug — only safe filesystem names
    if not re.match(r'^[a-z0-9][a-z0-9\-]{0,80}$', page_slug):
        raise HTTPException(status_code=422, detail="Invalid page slug")

    course_dir = _local_course_dir(course_id)
    wiki_dir   = course_dir / "wiki"
    page_path  = wiki_dir / f"{page_slug}.md"
    if not page_path.exists():
        raise HTTPException(status_code=404, detail=f"Page not found: {page_slug}")

    try:
        page = _parse_page(wiki_dir, page_path)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Parse error: {exc}")

    # Never send raw file path back to client
    page.pop("file_name", None)
    return page


@router.get("/local/{course_id}/parsed")
async def list_local_wiki_pages_parsed(course_id: str):
    """
    Return all wiki pages for a course as structured JSON list.
    Each entry: {slug, title, excerpt, word_count, frontmatter}.
    Full content is excluded for bandwidth; use /parsed/{slug} for full page.
    """
    course_dir = _local_course_dir(course_id)
    try:
        pages = _load_course(course_dir)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Load error: {exc}")

    return [
        {
            "slug": p["slug"],
            "title": p["title"],
            "excerpt": p["excerpt"],
            "word_count": p["word_count"],
            "frontmatter": p.get("frontmatter", {}),
        }
        for p in pages
    ]


@router.get("/local/{course_id}/search")
async def search_local_wiki(
    course_id: str,
    q: str = Query(..., min_length=2, max_length=200),
    top_k: int = Query(default=10, ge=1, le=50),
):
    """
    BM25 full-text search over a local course wiki.
    Returns [{slug, title, excerpt, score}] ordered by relevance.
    Mirrors the Rust WikiEngine search behaviour.
    """
    course_dir = _local_course_dir(course_id)
    try:
        pages = _load_course(course_dir)
        results = _wiki_search(pages, q, top_k=top_k)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Search error: {exc}")
    return results


# ── Public endpoints (student app) ───────────────────────────────────────────

@router.get("", response_model=list[CourseCatalogEntry])
async def list_courses():
    """Return the catalog of available courses with version info."""
    async with get_db() as db:
        async with db.execute(
            "SELECT id,title,description,version,wiki_page_count,size_bytes FROM course_catalog ORDER BY title"
        ) as cur:
            rows = await cur.fetchall()
    return [CourseCatalogEntry(**dict(r)) for r in rows]


@router.get("/{course_id}/bundle")
async def download_course_bundle(course_id: str):
    """Stream the course ZIP bundle to the student app."""
    async with get_db() as db:
        async with db.execute(
            "SELECT file_path FROM course_catalog WHERE id=?", (course_id,)
        ) as cur:
            row = await cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail=f"Course '{course_id}' not in catalog")
    path = Path(row["file_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="Bundle file missing on server")
    return FileResponse(
        path=str(path),
        media_type="application/zip",
        filename=f"{course_id}.zip",
    )


# ── Admin endpoints ───────────────────────────────────────────────────────────

@router.post("", dependencies=[Depends(_require_admin)], status_code=201)
async def upload_course(
    course_id: str = Form(...),
    title: str = Form(...),
    description: str = Form(""),
    version: str = Form(...),
    bundle: UploadFile = File(...),
):
    """
    Upload a new course bundle (ZIP file containing manifest.json + wiki/*.md).
    The ZIP is stored on disk and registered in the catalog.
    """
    # Validate course_id before using it as a filename — prevents path traversal.
    if not _SAFE_COURSE_ID.match(course_id):
        raise HTTPException(
            status_code=422,
            detail="course_id must be lowercase letters, digits, and hyphens only (e.g. 'algorithms')",
        )

    content = await bundle.read()

    # Validate ZIP before writing to disk — reject corrupt or non-ZIP uploads.
    import io
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            wiki_page_count = sum(1 for n in zf.namelist() if n.endswith(".md") and "/wiki/" in n)
    except zipfile.BadZipFile:
        raise HTTPException(status_code=422, detail="Uploaded file is not a valid ZIP archive")

    # Write to disk only after validation passes.
    dest = BUNDLES_DIR / f"{course_id}.zip"
    dest.write_bytes(content)

    now = datetime.now(timezone.utc).isoformat()
    async with get_db() as db:
        await db.execute(
            """
            INSERT INTO course_catalog (id,title,description,version,wiki_page_count,file_path,size_bytes,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?)
            ON CONFLICT(id) DO UPDATE SET
                title=excluded.title, description=excluded.description,
                version=excluded.version, wiki_page_count=excluded.wiki_page_count,
                file_path=excluded.file_path, size_bytes=excluded.size_bytes,
                updated_at=excluded.updated_at
            """,
            (course_id, title, description, version, wiki_page_count,
             str(dest), len(content), now, now),
        )
        await db.commit()

    return {"id": course_id, "message": f"Course '{course_id}' v{version} uploaded"}


@router.delete("/{course_id}", dependencies=[Depends(_require_admin)])
async def delete_course(course_id: str):
    async with get_db() as db:
        async with db.execute("SELECT file_path FROM course_catalog WHERE id=?", (course_id,)) as cur:
            row = await cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Course not found")
        await db.execute("DELETE FROM course_catalog WHERE id=?", (course_id,))
        await db.commit()
    path = Path(row["file_path"])
    if path.exists():
        path.unlink()
    return {"message": f"Course '{course_id}' deleted"}
