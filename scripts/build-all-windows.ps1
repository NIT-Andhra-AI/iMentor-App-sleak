<#
.SYNOPSIS
    Builds the Student AI Windows net installer.

.DESCRIPTION
    Produces one installer in dist\windows\:

    StudentAI-net-setup-x86_64.exe   (~43 MB)  — NSIS installer
        App + BGE embedding model + courses bundled.
        LLM handling (in order):
          1. Copies llm.gguf if placed alongside setup.exe during install
          2. Downloads from internet on first launch
          3. If no internet: shows "Connect to internet or place llm.gguf
             (renamed Phi-4-mini-instruct-Q4_K_M.gguf) alongside setup.exe"

    For offline distribution: place StudentAI-net-setup-x86_64.exe and
    llm.gguf (renamed Phi-4-mini-instruct-Q4_K_M.gguf) in the same folder.
    The NSIS hook detects llm.gguf and installs it automatically.
    Both files are produced in dist\windows\ by this script.

.PREREQUISITES
    - Rust + cargo (https://rustup.rs)
    - Bun (https://bun.sh)
    - cargo-tauri v2  (cargo install tauri-cli --version "^2")
    - bundled_model\Phi-4-mini-instruct-Q4_K_M.gguf (~2.4 GB) — for llm.gguf staging

.EXAMPLE
    # Build net installer + stage llm.gguf
    .\scripts\build-all-windows.ps1

    # Skip preflight checks
    .\scripts\build-all-windows.ps1 -SkipPreflight
#>

param(
    [string]$Target         = "x86_64-pc-windows-msvc",
    [switch]$SkipPreflight,
    [switch]$SkipManifestCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent

if (-not $SkipPreflight) {
    Write-Host "=== preflight: verify-release-matrix.ps1 ===" -ForegroundColor Cyan
    & (Join-Path $RepoRoot "scripts\verify-release-matrix.ps1") -Targets @($Target)
    if ($LASTEXITCODE -ne 0) { throw "Preflight verification failed (exit $LASTEXITCODE)" }
}

if (-not $SkipManifestCheck) {
    Write-Host "=== preflight: manifest check-only ===" -ForegroundColor Cyan
    python3 (Join-Path $RepoRoot "scripts\normalize_course_manifests.py") --check-only
    if ($LASTEXITCODE -ne 0) { throw "Manifest validation failed (exit $LASTEXITCODE)" }
}

# Regenerate all derived config files from workspace.toml before building.
Write-Host "=== gen-config.py: regenerating configs ===" -ForegroundColor Cyan
python3 (Join-Path $RepoRoot "scripts\gen-config.py")
if ($LASTEXITCODE -ne 0) { throw "gen-config.py failed (exit $LASTEXITCODE)" }

$OutDir  = Join-Path $RepoRoot "dist\windows"
$NsisSrc = Join-Path $RepoRoot "target\$Target\release\bundle\nsis"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$arch = $Target.Replace("-pc-windows-msvc", "")

function Invoke-TauriBuild {
    param([string]$Label, [string]$OutputName, [string]$ExtraConfig = "")

    Write-Host "`n=== Building: $Label ===" -ForegroundColor Cyan

    Push-Location $RepoRoot
    try {
        if ($ExtraConfig) {
            cargo tauri build --target $Target --config $ExtraConfig
        } else {
            cargo tauri build --target $Target
        }
        if ($LASTEXITCODE -ne 0) { throw "Build failed for $Label (exit $LASTEXITCODE)" }
    } finally {
        Pop-Location
    }

    $nsisExe = Get-ChildItem -Path $NsisSrc -Filter "*setup.exe" -ErrorAction SilentlyContinue |
               Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if (-not $nsisExe) { throw "No NSIS EXE found in $NsisSrc after building $Label" }

    $dest = Join-Path $OutDir "$OutputName-$arch.exe"
    Copy-Item -Path $nsisExe.FullName -Destination $dest -Force
    $sizeMb = [math]::Round((Get-Item $dest).Length / 1MB, 0)
    Write-Host "  -> $dest  ($sizeMb MB)" -ForegroundColor Green
}

# ── Net installer ─────────────────────────────────────────────────────────────
Invoke-TauriBuild -Label "Net installer (app + BGE + courses)" -OutputName "StudentAI-net-setup"

# ── Stage llm.gguf for offline sidecar distribution ───────────────────────────
# Place both StudentAI-net-setup-x86_64.exe and llm.gguf in the same folder.
# The NSIS hook detects llm.gguf and copies it automatically during install.
$llmSrc  = Join-Path $RepoRoot "bundled_model\Phi-4-mini-instruct-Q4_K_M.gguf"
$llmDest = Join-Path $OutDir "llm.gguf"
if (Test-Path $llmSrc) {
    Copy-Item $llmSrc $llmDest -Force
    $llmMb = [math]::Round((Get-Item $llmDest).Length / 1MB, 0)
    Write-Host "  Staged: llm.gguf  ($llmMb MB)  -> $llmDest" -ForegroundColor DarkGray
} else {
    Write-Warning "llm.gguf not staged: bundled_model\Phi-4-mini-instruct-Q4_K_M.gguf not found."
    Write-Warning "For offline distribution, copy the model manually to $llmDest and rename it llm.gguf."
}

# ── Summary ───────────────────────────────────────────────────────────────────
Write-Host "`n=== Build complete ===" -ForegroundColor Green
Write-Host "Output: $OutDir"
Get-ChildItem $OutDir | ForEach-Object {
    $mb = [math]::Round($_.Length / 1MB, 0)
    Write-Host "  $($_.Name.PadRight(55)) $mb MB"
}
Write-Host ""
Write-Host "  Online  — share StudentAI-net-setup-$arch.exe alone (LLM downloads on first launch)"
Write-Host "  Offline — share both files from $OutDir in the same folder; NSIS installs llm.gguf automatically"
