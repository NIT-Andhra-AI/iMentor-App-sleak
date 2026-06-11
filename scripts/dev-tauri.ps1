param(
    [switch]$SkipManifestCheck
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent

# Prefer local bun shim when present.
$TmpBin = Join-Path $RepoRoot ".tmp\bin"
if (Test-Path $TmpBin) {
    $env:PATH = "$TmpBin;$env:PATH"
}

if (-not $SkipManifestCheck) {
    Write-Host "=== preflight: manifest check-only ===" -ForegroundColor Cyan
    python3 (Join-Path $RepoRoot "scripts\normalize_course_manifests.py") --check-only
    if ($LASTEXITCODE -ne 0) { throw "Manifest validation failed (exit $LASTEXITCODE)" }
}

Write-Host "=== starting: cargo tauri dev ===" -ForegroundColor Cyan
Push-Location $RepoRoot
try {
    cargo tauri dev
    if ($LASTEXITCODE -ne 0) { throw "cargo tauri dev failed (exit $LASTEXITCODE)" }
} finally {
    Pop-Location
}
