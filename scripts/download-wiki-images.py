#!/usr/bin/env python3
"""
Download all Wikimedia images referenced in course markdown files
and rewrite the markdown to use local /images/ paths.

Usage:
    python scripts/download-wiki-images.py [--dry-run] [--rewrite-only]

Options:
    --dry-run      Only print what would be downloaded, don't download
    --rewrite-only Skip downloading, only rewrite markdown (images already present)
"""

import os
import re
import sys
import time
import random
import hashlib
import urllib.request
import urllib.parse
from pathlib import Path
from collections import defaultdict

# Force UTF-8 output on Windows
if sys.platform == "win32":
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace", line_buffering=True)
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace", line_buffering=True)

# ── Config ─────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
COURSES_DIR = ROOT / "assets" / "courses"
IMAGES_DIR  = ROOT / "frontend" / "public" / "images"
WEB_PATH    = "/images"           # how they'll be served in the WebView

DRY_RUN      = "--dry-run"      in sys.argv
REWRITE_ONLY = "--rewrite-only" in sys.argv
STRIP_REMOTE = "--strip-remote" in sys.argv  # also remove unresolvable remote image refs

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0 Safari/537.36"
    )
}

# ── Helpers ────────────────────────────────────────────────────────────────
def safe_basename(url: str) -> str:
    """URL-decode the last path segment and replace non-filesystem-safe chars."""
    raw = urllib.parse.urlparse(url).path.split("/")[-1]
    decoded = urllib.parse.unquote(raw)
    # Keep alphanumeric, dot, hyphen, underscore; collapse others to _
    safe = re.sub(r"[^\w\-.]", "_", decoded)
    return safe

def url_hash(url: str) -> str:
    return hashlib.sha256(url.encode()).hexdigest()[:8]

def assign_filenames(urls: list[str]) -> dict[str, str]:
    """
    Map each URL to a unique local filename.
    Prefer the bare basename; if it collides, prefix with url_hash.
    """
    basename_to_urls: dict[str, list[str]] = defaultdict(list)
    for url in urls:
        basename_to_urls[safe_basename(url)].append(url)

    mapping: dict[str, str] = {}
    for basename, group in basename_to_urls.items():
        if len(group) == 1:
            mapping[group[0]] = basename
        else:
            for url in group:
                mapping[url] = f"{url_hash(url)}_{basename}"
    return mapping

def download(url: str, dest: Path, max_retries: int = 2) -> tuple[bool, str]:
    """Returns (success, status) where status is 'ok', '404', '429', or 'error'."""
    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as resp:
                if resp.status != 200:
                    return False, 'error'
                dest.write_bytes(resp.read())
            return True, 'ok'
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return False, '404'
            if e.code == 429:
                if attempt == 0:
                    # Parse Retry-After header if present
                    retry_after = e.headers.get('Retry-After', None)
                    wait = int(retry_after) if retry_after and retry_after.isdigit() else 60
                    wait = min(wait, 90)  # cap at 90 seconds
                    print(f"  429 — waiting {wait}s …")
                    time.sleep(wait)
                    continue
                return False, '429'
            print(f"  FAILED (HTTP {e.code}: {e.reason})")
            return False, 'error'
        except Exception as e:
            print(f"  FAILED ({type(e).__name__}: {e})")
            return False, 'error'
    return False, '429'

# Conservative delay between requests to stay within Wikimedia rate limits
REQUEST_DELAY = (12.0, 18.0)

# ── Step 1: Collect all image URLs ────────────────────────────────────────
md_files = list(COURSES_DIR.rglob("*.md"))
print(f"Scanning {len(md_files)} markdown files …")

url_pattern = re.compile(r'!\[[^\]]*\]\((https?://[^\)"\s]+)\)')

all_urls: set[str] = set()
for md in md_files:
    text = md.read_text(encoding="utf-8")
    for m in url_pattern.finditer(text):
        all_urls.add(m.group(1))

urls_sorted = sorted(all_urls)
print(f"Found {len(urls_sorted)} unique image URLs\n")

# ── Step 2: Assign local filenames ────────────────────────────────────────
url_to_filename = assign_filenames(urls_sorted)

# ── Step 3: Download (unless --rewrite-only) ──────────────────────────────
if not DRY_RUN:
    IMAGES_DIR.mkdir(parents=True, exist_ok=True)

ok_count   = 0
skip_count = 0
fail_count = 0
failed_404: list[str] = []
failed_429: list[str] = []
failed_other: list[str] = []

if not REWRITE_ONLY:
    print("=" * 60)
    print("DOWNLOADING IMAGES")
    print("=" * 60)
    for i, url in enumerate(urls_sorted, 1):
        filename = url_to_filename[url]
        dest = IMAGES_DIR / filename
        prefix = f"[{i:>3}/{len(urls_sorted)}]"
        if dest.exists():
            print(f"{prefix} SKIP  {filename}")
            skip_count += 1
            continue
        print(f"{prefix} GET   {filename}", flush=True)
        if DRY_RUN:
            ok_count += 1
            continue
        time.sleep(random.uniform(*REQUEST_DELAY))
        success, status = download(url, dest)
        if success:
            size_kb = dest.stat().st_size // 1024
            print(f"       -> {size_kb} KB")
            ok_count += 1
        else:
            if status == '404':
                print(f"       404 (hallucinated URL)")
                failed_404.append(url)
            elif status == '429':
                print(f"       429 rate-limited (try again later)")
                failed_429.append(url)
            else:
                failed_other.append(url)
            fail_count += 1

    print()
    print(f"Downloaded: {ok_count}  Skipped: {skip_count}  Failed: {fail_count}")

    # Save failure logs
    if failed_404:
        (ROOT / "failed-404.txt").write_text("\n".join(failed_404), encoding="utf-8")
        print(f"404 failures ({len(failed_404)}): failed-404.txt")
    if failed_429:
        (ROOT / "failed-429.txt").write_text("\n".join(failed_429), encoding="utf-8")
        print(f"429 failures ({len(failed_429)}): failed-429.txt (retry later)")

# ── Step 4: Rewrite markdown files ────────────────────────────────────────
if DRY_RUN:
    print("\n[DRY RUN] Would rewrite markdown URLs. Exiting.")
    sys.exit(0)

# Only rewrite URLs that were successfully downloaded (or have SVG fallbacks)
# url_to_final_filename: url -> the filename actually present on disk
url_to_final_filename: dict[str, str] = {}

def find_local_file(fn: str) -> str | None:
    """Return the actual filename to use: exact match, or .svg fallback for GIF/PNG."""
    if (IMAGES_DIR / fn).exists():
        return fn
    # Check for SVG fallback generated by Gemini (e.g., foo.gif.svg for foo.gif)
    svg_name = fn + ".svg"
    if (IMAGES_DIR / svg_name).exists():
        return svg_name
    # Also check base name with .svg extension (foo.gif -> foo.svg)
    base = fn.rsplit(".", 1)[0]
    alt_svg = base + ".svg"
    if (IMAGES_DIR / alt_svg).exists():
        return alt_svg
    # For hash-prefixed names (e.g., abc12345_Gradient_descent.gif from collision
    # deduplication), strip the 8-char hex prefix and check the bare basename.
    if "_" in fn and len(fn.split("_", 1)[0]) == 8:
        bare = fn.split("_", 1)[1]
        found = find_local_file(bare)
        if found:
            return found
    return None

if REWRITE_ONLY:
    if IMAGES_DIR.exists():
        for url, fn in url_to_filename.items():
            found = find_local_file(fn)
            if found:
                url_to_final_filename[url] = found
else:
    for url, fn in url_to_filename.items():
        found = find_local_file(fn)
        if found:
            url_to_final_filename[url] = found

print(f"\n{len(url_to_final_filename)} images present locally — rewriting markdown …\n")

rewritten_files = 0
rewritten_urls  = 0

# Pattern to match any remaining remote image markdown reference
remote_img_pattern = re.compile(r'!\[[^\]]*\]\((https?://[^\)"\s]+)\)')

for md in md_files:
    original = md.read_text(encoding="utf-8")
    updated  = original

    for url, local_fn in url_to_final_filename.items():
        if url in updated:
            local_web = f"{WEB_PATH}/{local_fn}"
            updated   = updated.replace(url, local_web)

    if STRIP_REMOTE:
        # Remove any remaining remote image refs that we couldn't resolve locally
        stripped, n = re.subn(remote_img_pattern, "", updated)
        if n:
            updated = stripped

    if updated != original:
        md.write_text(updated, encoding="utf-8")
        changed = sum(1 for u in url_to_final_filename if u in original)
        print(f"  Updated {md.relative_to(ROOT)}  ({changed} URL(s))")
        rewritten_files += 1
        rewritten_urls  += changed

print(f"\nDone. {rewritten_files} files updated, ~{rewritten_urls} URL replacements.")
print(f"\nImages at : {IMAGES_DIR}")
print(f"Web path  : {WEB_PATH}/<filename>")
print("\nNext step : cargo tauri build … to bundle them into the installer.")

