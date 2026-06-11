<#
.SYNOPSIS
    Creates a self-contained developer handoff clone at handoff/student-ai/.

.DESCRIPTION
    Copies the app (dev -> build -> tests) into an isolated folder that developers
    can zip and share. Excludes all auxiliary drift: server/, archived-courses/,
    build logs, reports, bench-results, admin-venv, and all build/cache outputs.

    Run from the repo root:
        .\scripts\create-handoff.ps1

    To skip the large model files (~7.5 GB) for faster transfer:
        .\scripts\create-handoff.ps1 -NoModels

    To refresh: delete handoff/student-ai/ and re-run.

.PARAMETER NoModels
    Skip copying models/ and bundled_model/. Developers can fetch models later
    using scripts/download-models.ps1 from the clone.

.PARAMETER Destination
    Override the default destination (default: handoff/student-ai relative to
    repo root). Can be absolute or relative.
#>

param(
    [switch]$NoModels,
    [string]$Destination = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ── Resolve repo root and destination ───────────────────────────────────────
$repoRoot = $PSScriptRoot | Split-Path -Parent
if (-not $Destination) {
    $Destination = Join-Path $repoRoot "handoff\student-ai"
}
if (-not [System.IO.Path]::IsPathRooted($Destination)) {
    $Destination = Join-Path $repoRoot $Destination
}

Write-Host ""
Write-Host "Student AI — Developer Handoff Clone" -ForegroundColor Cyan
Write-Host "  Source : $repoRoot"
Write-Host "  Dest   : $Destination"
if ($NoModels) {
    Write-Host "  Models : SKIPPED (--NoModels)" -ForegroundColor Yellow
} else {
    Write-Host "  Models : included (~7.5 GB)" -ForegroundColor Yellow
}
Write-Host ""

# Guard: refuse to overwrite without explicit deletion
if (Test-Path $Destination) {
    Write-Host "ERROR: Destination already exists: $Destination" -ForegroundColor Red
    Write-Host "Delete it first (Remove-Item -Recurse -Force '$Destination') then re-run." -ForegroundColor Red
    exit 1
}

New-Item -ItemType Directory -Path $Destination -Force | Out-Null

# ── Helper: robocopy a single folder ────────────────────────────────────────
# Directories excluded globally wherever they appear inside a copied tree
$globalExcludeDirs = @(
    "target",
    "node_modules",
    "dist",
    "test-results",
    "artifacts",
    "playwright-report",
    "__pycache__",
    "cold_storage"
)

function Copy-Folder {
    param(
        [string]$Src,
        [string]$DstBase,
        [string[]]$ExtraExcludeDirs = @()
    )
    $leafName = Split-Path $Src -Leaf
    $dst = Join-Path $DstBase $leafName
    $excludeDirs = $globalExcludeDirs + $ExtraExcludeDirs

    $roboArgs = @(
        $Src, $dst,
        "/E",           # recurse including empty dirs
        "/COPY:DAT",    # data + attributes + timestamps
        "/XD"
    ) + $excludeDirs + @(
        "/NFL",         # no file list
        "/NDL",         # no dir list
        "/NJH",         # no job header
        "/NJS"          # no job summary
    )

    $result = & robocopy @roboArgs
    # robocopy exit codes 0-7 are success/informational; ≥8 is error
    if ($LASTEXITCODE -ge 8) {
        Write-Host "  ERROR copying $leafName (robocopy exit $LASTEXITCODE)" -ForegroundColor Red
        exit 1
    }
}

# ── Helper: copy explicit root-level file ───────────────────────────────────
function Copy-RootFile {
    param([string]$Name)
    $src = Join-Path $repoRoot $Name
    if (Test-Path $src) {
        Copy-Item $src -Destination $Destination
    } else {
        Write-Host "  WARN: $Name not found, skipping" -ForegroundColor Yellow
    }
}

# ── Phase 1: Root files ──────────────────────────────────────────────────────
Write-Host "Copying root files..." -ForegroundColor Gray
foreach ($f in @("Cargo.toml", "Cargo.lock", "workspace.toml", "README.md", "QUICK_REFERENCE.md", ".gitignore")) {
    Copy-RootFile $f
}

# ── Phase 2: Core app folders ────────────────────────────────────────────────
$coreFolders = @(
    "frontend",
    "src-tauri",
    "crates",
    "assets",
    "docs"
)
foreach ($folder in $coreFolders) {
    Write-Host "Copying $folder/..." -ForegroundColor Gray
    Copy-Folder -Src (Join-Path $repoRoot $folder) -DstBase $Destination
}

# ── Phase 3: Tests (extra exclusions for e2e runtime artifacts) ──────────────
Write-Host "Copying tests/..." -ForegroundColor Gray
Copy-Folder -Src (Join-Path $repoRoot "tests") -DstBase $Destination `
    -ExtraExcludeDirs @("node_modules")

# ── Phase 4: Scripts and tools ───────────────────────────────────────────────
Write-Host "Copying scripts/..." -ForegroundColor Gray
Copy-Folder -Src (Join-Path $repoRoot "scripts") -DstBase $Destination

Write-Host "Copying tools/..." -ForegroundColor Gray
Copy-Folder -Src (Join-Path $repoRoot "tools") -DstBase $Destination

# ── Phase 5: Hidden config folders ───────────────────────────────────────────
Write-Host "Copying .cargo/..." -ForegroundColor Gray
Copy-Folder -Src (Join-Path $repoRoot ".cargo") -DstBase $Destination

Write-Host "Copying .github/..." -ForegroundColor Gray
Copy-Folder -Src (Join-Path $repoRoot ".github") -DstBase $Destination

if (Test-Path (Join-Path $repoRoot ".vscode")) {
    Write-Host "Copying .vscode/..." -ForegroundColor Gray
    Copy-Folder -Src (Join-Path $repoRoot ".vscode") -DstBase $Destination
}

# ── Phase 6: Model files (large binaries, optional) ──────────────────────────
if (-not $NoModels) {
    foreach ($modelDir in @("bundled_model", "models")) {
        $src = Join-Path $repoRoot $modelDir
        if (Test-Path $src) {
            Write-Host "Copying $modelDir/ (large — please wait)..." -ForegroundColor Yellow
            Copy-Folder -Src $src -DstBase $Destination
        }
    }
} else {
    Write-Host "Skipping model directories (--NoModels)" -ForegroundColor Yellow
    # Create empty placeholder directories so the build structure is intact
    foreach ($modelDir in @("bundled_model", "models")) {
        $emptyDst = Join-Path $Destination $modelDir
        New-Item -ItemType Directory -Path $emptyDst -Force | Out-Null
        Set-Content -Path (Join-Path $emptyDst ".gitkeep") -Value ""
    }
}

# ── Phase 7: Write clone-local .gitignore ────────────────────────────────────
# Prevent the handoff folder's own git (if any) from staging large model files
$cloneGitignore = @"
# Build and cache outputs
target/
**/node_modules/
**/dist/
frontend/dist/
**/__pycache__/

# Model binaries — download via scripts/download-models.ps1
*.gguf

# Runtime artifacts
/tests/desktop-e2e/test-results/
/tests/desktop-e2e/artifacts/
/tests/desktop-e2e/playwright-report/

# Generated configs (re-create with: python scripts/gen-config.py)
src-tauri/build_config.toml
src-tauri/models.toml
src-tauri/tauri.conf.json
src-tauri/tauri-withmodel.conf.json
src-tauri/tauri-gpu-withmodel.conf.json

# Logs and temp
*.log
nohup.out
.DS_Store
Thumbs.db
.env
*.env
"@
Set-Content -Path (Join-Path $Destination ".gitignore") -Value $cloneGitignore

# ── Phase 8: Write HANDOFF.md ─────────────────────────────────────────────────
$handoffMd = @"
# Student AI — Developer Handoff

This folder is a self-contained copy of the Student AI app, ready for development,
build, and testing. It was generated from the main repository by
``scripts/create-handoff.ps1``.

## Quick Start

### Prerequisites
Run ``scripts/dev-setup.ps1`` (Windows) or ``bash scripts/dev-setup.sh`` (Ubuntu)
to install VS Build Tools, LLVM, Rust, and Bun.

See full setup guides:
- [docs/setup-windows.md](docs/setup-windows.md)
- [docs/setup-ubuntu.md](docs/setup-ubuntu.md)

### Development
``````powershell
# Install frontend deps
cd frontend; bun install; cd ..

# Start dev mode (hot-reload Svelte + debug Rust)
cargo tauri dev
``````

### Build Variants

| Variant | Command |
|---|---|
| Net-downloader (model fetched on first run) | ``cargo tauri build --target x86_64-pc-windows-msvc`` |
| Bundled Phi-4-mini (~2.5 GB MSI) | ``cargo tauri build --target x86_64-pc-windows-msvc --config src-tauri/tauri-withmodel.conf.json`` |
| Bundled Gemma E2B | ``cargo tauri build --target x86_64-pc-windows-msvc --config src-tauri/tauri-gemma-e2b-withmodel.conf.json`` |
| Vulkan GPU offload | ``cargo tauri build -- --features vulkan`` |

### Frontend Only
``````powershell
cd frontend
bun install
bun run check     # TypeScript + Svelte check
bun run build     # Production Vite build
``````

### Tests
``````powershell
# Crate unit tests
cargo test -p wiki
cargo test -p storage

# All workspace tests
cargo test --workspace

# Desktop E2E (requires built app)
cd tests/desktop-e2e
bun install
bun run test smoke.spec.ts
``````

## Model Files

| Slot | File | Size | Purpose |
|---|---|---|---|
| chat-model-1.gguf | bundled_model/Phi-4-mini-instruct-Q4_K_M.gguf | ~2.4 GB | Default chat model |
| chat-model-2.gguf | models/gemma-4-e4b-it-Q4_K_M.gguf | ~5.1 GB | High-quality MoE variant |
| rag-model-1.gguf | bundled_model/bge-small-en-v1.5-q8_0.gguf | ~35 MB | RAG embeddings |

If models are missing, run:
``````powershell
.\scripts\download-models.ps1
``````

## Config System

All model and deployment settings live in ``workspace.toml``. Edit it, then
regenerate the downstream configs:

``````powershell
python scripts/gen-config.py
``````

This writes ``src-tauri/models.toml``, ``src-tauri/build_config.toml``, and
all ``src-tauri/tauri*.conf.json`` variants. The build system (``src-tauri/build.rs``)
also runs this automatically at compile time.

## What's NOT Included

- ``server/`` — admin dashboard (not part of the student app)
- ``archived-courses/`` — superseded course packages
- ``admin-venv/`` — Python virtual environment (recreate with ``python -m venv admin-venv``)
- Build artifacts (``target/``, ``frontend/dist/``, ``node_modules/``)
- Build and test logs (the root ``.txt`` files in the main repo)

## Refreshing This Clone

Delete this folder and re-run from the main repository:
``````powershell
Remove-Item -Recurse -Force handoff\student-ai
.\scripts\create-handoff.ps1
``````
"@
Set-Content -Path (Join-Path $Destination "HANDOFF.md") -Value $handoffMd

# ── Summary ──────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "Done." -ForegroundColor Green
Write-Host ""

# Count files (excluding model binaries for speed)
$fileCount = (Get-ChildItem $Destination -Recurse -File | Where-Object { $_.Extension -ne ".gguf" }).Count
Write-Host "  Files copied (excl. models): $fileCount"
Write-Host "  Location: $Destination"
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. cd '$Destination'"
Write-Host "  2. cd frontend; bun install; cd .."
Write-Host "  3. cargo tauri dev"
Write-Host ""
Write-Host "To share: zip '$Destination' and send to developers."
if ($NoModels) {
    Write-Host "  NOTE: Models excluded. Devs must run .\scripts\download-models.ps1 in the clone." -ForegroundColor Yellow
}
