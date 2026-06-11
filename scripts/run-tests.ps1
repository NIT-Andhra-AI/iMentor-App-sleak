#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Student AI — Install, build, and run rigorous Playwright tests with latency + quality metrics.

.DESCRIPTION
    This script:
      1. Validates prerequisites (Node, bun, Rust/cargo, Playwright browsers)
      2. Generates Tauri config (gen-config.py)
      3. Builds the Svelte frontend (vite build)
      4. Starts the Vite dev server for Playwright tests
      5. Installs Playwright browsers if missing
      6. Installs e2e test dependencies
      7. Runs selected test suites sequentially
      8. Prints the latency & quality report to console
      9. Opens the HTML report

.PARAMETER Suite
    Which suite to run: "all" | "core" | "latency" | "smoke" | "general-chat" | "rag" | "course-chat" | "agents" | "stress"
    Default: "core"

.PARAMETER SkipBuild
    Skip the frontend build step (use existing dist/)

.PARAMETER SkipInstall
    Skip bun install steps

.PARAMETER Headless
    Run Playwright in headless mode (default is headful so you can watch)

.EXAMPLE
    .\run-tests.ps1                         # Core suite (chat + RAG + courses + agents)
    .\run-tests.ps1 -Suite latency          # Latency & quality benchmark only
    .\run-tests.ps1 -Suite all -Headless    # Full suite headless
    .\run-tests.ps1 -Suite general-chat -SkipBuild
#>

param(
    [ValidateSet("all", "core", "latency", "smoke", "general-chat", "rag", "course-chat", "agents", "stress", "course-crawl", "visualizations")]
    [string]$Suite = "core",
    [switch]$SkipBuild,
    [switch]$SkipInstall,
    [switch]$Headless
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$ROOT   = Split-Path -Parent $PSScriptRoot
$FE_DIR = Join-Path $ROOT "frontend"
$E2E_DIR = Join-Path $ROOT "tests\desktop-e2e"
$REPORTS_DIR = Join-Path $E2E_DIR "test-results"

# ── Colour helpers ────────────────────────────────────────────────────────────
function Write-Step  { param($msg) Write-Host "`n▶ $msg" -ForegroundColor Cyan }
function Write-Ok    { param($msg) Write-Host "  ✅ $msg" -ForegroundColor Green }
function Write-Warn  { param($msg) Write-Host "  ⚠️  $msg" -ForegroundColor Yellow }
function Write-Fail  { param($msg) Write-Host "  ❌ $msg" -ForegroundColor Red }

function Assert-Command {
    param($cmd, $hint)
    if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
        Write-Fail "$cmd not found. $hint"
        exit 1
    }
    Write-Ok "$cmd found"
}

# ── 0. Banner ─────────────────────────────────────────────────────────────────
Write-Host @"

╔══════════════════════════════════════════════════════════════╗
║   Student AI — Playwright Test Runner with Latency Metrics   ║
║   Suite: $Suite$((" " * (52 - $Suite.Length)))║
╚══════════════════════════════════════════════════════════════╝
"@ -ForegroundColor Magenta

# ── 1. Prerequisites ──────────────────────────────────────────────────────────
Write-Step "Checking prerequisites..."
Assert-Command "node"   "Install Node.js 18+ from https://nodejs.org"
Assert-Command "bun"    "Install bun: https://bun.sh"
Assert-Command "python" "Install Python 3.10+ from https://python.org"
Write-Ok "All prerequisites satisfied"

# ── 2. Generate Tauri config ──────────────────────────────────────────────────
Write-Step "Generating Tauri config from workspace.toml..."
$genConfig = Join-Path $ROOT "scripts\gen-config.py"
if (Test-Path $genConfig) {
    python $genConfig
    Write-Ok "Tauri config generated"
} else {
    Write-Warn "scripts/gen-config.py not found — skipping config generation"
}

# ── 3. Frontend install + build ───────────────────────────────────────────────
if (-not $SkipInstall) {
    Write-Step "Installing frontend dependencies..."
    Push-Location $FE_DIR
    bun install --frozen-lockfile 2>&1 | Select-Object -Last 5
    Pop-Location
    Write-Ok "Frontend dependencies installed"
}

if (-not $SkipBuild) {
    Write-Step "Building Svelte frontend (vite build)..."
    Push-Location $FE_DIR
    bun run build 2>&1 | Tee-Object -Variable buildOut | Select-Object -Last 10
    Pop-Location
    if ($LASTEXITCODE -ne 0) {
        Write-Fail "Frontend build failed"
        exit 1
    }
    Write-Ok "Frontend built successfully"
}

# ── 4. Start Vite dev server ──────────────────────────────────────────────────
Write-Step "Starting Vite dev server on port 5173..."
$viteJob = Start-Job -ScriptBlock {
    Set-Location $using:FE_DIR
    bun run dev 2>&1
}

# Give Vite time to start
$maxWait = 30
$waited = 0
$viteReady = $false
Write-Host "  Waiting for Vite server" -NoNewline
while ($waited -lt $maxWait) {
    Start-Sleep 1
    $waited++
    Write-Host "." -NoNewline
    try {
        $resp = Invoke-WebRequest -Uri "http://127.0.0.1:5173" -TimeoutSec 2 -ErrorAction Stop
        if ($resp.StatusCode -eq 200) {
            $viteReady = $true
            break
        }
    } catch { }
}
Write-Host ""

if (-not $viteReady) {
    Write-Warn "Vite did not respond after ${maxWait}s — tests may still work if HMR is slow"
} else {
    Write-Ok "Vite server ready at http://127.0.0.1:5173"
}

# ── 5. E2E dependencies ────────────────────────────────────────────────────────
if (-not $SkipInstall) {
    Write-Step "Installing Playwright e2e dependencies..."
    Push-Location $E2E_DIR
    bun install --frozen-lockfile 2>&1 | Select-Object -Last 5
    Pop-Location
    Write-Ok "Playwright dependencies installed"
}

# ── 6. Playwright browsers ────────────────────────────────────────────────────
Write-Step "Ensuring Playwright browsers are installed..."
Push-Location $E2E_DIR
try {
    bunx playwright install --with-deps chromium 2>&1 | Select-Object -Last 5
    Write-Ok "Playwright Chromium browser ready"
} catch {
    Write-Warn "Playwright browser install may have partially failed — continuing"
}
Pop-Location

# ── 7. Run test suite ─────────────────────────────────────────────────────────
Write-Step "Running test suite: $Suite"
$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"

Push-Location $E2E_DIR

$headlessFlag = if ($Headless) { "--headed=false" } else { "--headed" }

# Map suite name to bun script or playwright args
$exitCode = 0
switch ($Suite) {
    "all"          { bunx playwright test $headlessFlag 2>&1 | Tee-Object "$REPORTS_DIR\run-$timestamp.log"; $exitCode = $LASTEXITCODE }
    "core"         { bunx playwright test --project=smoke --project=general-chat --project=rag-documents --project=course-chat --project=agents $headlessFlag 2>&1 | Tee-Object "$REPORTS_DIR\run-$timestamp.log"; $exitCode = $LASTEXITCODE }
    "latency"      { bunx playwright test --project=latency-quality $headlessFlag 2>&1 | Tee-Object "$REPORTS_DIR\run-$timestamp.log"; $exitCode = $LASTEXITCODE }
    "smoke"        { bunx playwright test --project=smoke $headlessFlag 2>&1 | Tee-Object "$REPORTS_DIR\run-$timestamp.log"; $exitCode = $LASTEXITCODE }
    "general-chat" { bunx playwright test --project=general-chat $headlessFlag 2>&1 | Tee-Object "$REPORTS_DIR\run-$timestamp.log"; $exitCode = $LASTEXITCODE }
    "rag"          { bunx playwright test --project=rag-documents $headlessFlag 2>&1 | Tee-Object "$REPORTS_DIR\run-$timestamp.log"; $exitCode = $LASTEXITCODE }
    "course-chat"  { bunx playwright test --project=course-chat $headlessFlag 2>&1 | Tee-Object "$REPORTS_DIR\run-$timestamp.log"; $exitCode = $LASTEXITCODE }
    "agents"       { bunx playwright test --project=agents $headlessFlag 2>&1 | Tee-Object "$REPORTS_DIR\run-$timestamp.log"; $exitCode = $LASTEXITCODE }
    "stress"       { bunx playwright test --project=stress $headlessFlag 2>&1 | Tee-Object "$REPORTS_DIR\run-$timestamp.log"; $exitCode = $LASTEXITCODE }
    "course-crawl" { bunx playwright test --project=course-crawl $headlessFlag 2>&1 | Tee-Object "$REPORTS_DIR\run-$timestamp.log"; $exitCode = $LASTEXITCODE }
    "visualizations" { bunx playwright test --project=visualizations $headlessFlag 2>&1 | Tee-Object "$REPORTS_DIR\run-$timestamp.log"; $exitCode = $LASTEXITCODE }
}

Pop-Location

# ── 8. Print Latency & Quality Report ────────────────────────────────────────
$metricsFile = "$REPORTS_DIR\latency-quality-report.md"
if (Test-Path $metricsFile) {
    Write-Step "Latency & Quality Report"
    Write-Host ""
    Get-Content $metricsFile | Write-Host
    Write-Host ""
    Write-Ok "Full report saved to: $metricsFile"
    $jsonFile = "$REPORTS_DIR\latency-quality-report.json"
    if (Test-Path $jsonFile) {
        Write-Ok "JSON report: $jsonFile"
    }
} else {
    Write-Warn "No latency-quality-report.md found (run -Suite latency or -Suite all to generate)"
}

# ── 9. HTML report ────────────────────────────────────────────────────────────
$htmlDir = "$REPORTS_DIR\html"
if (Test-Path "$htmlDir\index.html") {
    Write-Step "Opening Playwright HTML report..."
    Start-Process "$htmlDir\index.html"
}

# ── 10. Cleanup ───────────────────────────────────────────────────────────────
Write-Step "Stopping Vite dev server..."
Stop-Job $viteJob -ErrorAction SilentlyContinue
Remove-Job $viteJob -ErrorAction SilentlyContinue
Write-Ok "Vite server stopped"

# ── 11. Summary ───────────────────────────────────────────────────────────────
Write-Host ""
if ($exitCode -eq 0) {
    Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Green
    Write-Host "║   ✅ ALL TESTS PASSED                ║" -ForegroundColor Green
    Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Green
} else {
    Write-Host "╔══════════════════════════════════════╗" -ForegroundColor Red
    Write-Host "║   ❌ SOME TESTS FAILED               ║" -ForegroundColor Red
    Write-Host "║   Check: $REPORTS_DIR\html  ║" -ForegroundColor Red
    Write-Host "╚══════════════════════════════════════╝" -ForegroundColor Red
}
Write-Host ""

exit $exitCode
