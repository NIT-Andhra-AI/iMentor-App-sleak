# scripts/dev-setup.ps1
# One-shot Windows developer environment setup for Student AI.
#
# Run from an elevated PowerShell (Run as Administrator):
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   .\scripts\dev-setup.ps1
#
# What it does:
#   1. Installs VS Build Tools 2022 + C++ workload via winget
#   2. Installs LLVM (for libclang / bindgen)
#   3. Installs Rustup + stable-msvc toolchain
#   4. Installs Bun
#   5. Installs frontend Bun dependencies
#   6. Creates admin-venv Python virtual environment
#   7. Installs course-gen Python dependencies into admin-venv

param(
    [switch]$SkipVsBuildTools,
    [switch]$SkipLLVM,
    [switch]$SkipRust
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path $PSScriptRoot -Parent
Set-Location $RepoRoot

function Log  { param($msg) Write-Host "▶  $msg" -ForegroundColor Green }
function Warn { param($msg) Write-Host "⚠  $msg" -ForegroundColor Yellow }
function Err  { param($msg) Write-Host "✗  $msg" -ForegroundColor Red; exit 1 }

function Test-Command { param($name) return [bool](Get-Command $name -ErrorAction SilentlyContinue) }

# ── 1. VS Build Tools 2022 (MSVC C++ workload) ───────────────────────────────
if (-not $SkipVsBuildTools) {
    $vsInstalled = Get-Command cl.exe -ErrorAction SilentlyContinue
    if (-not $vsInstalled) {
        Log "Installing VS Build Tools 2022 (MSVC C++ + Windows 11 SDK)..."
        winget install --id Microsoft.VisualStudio.2022.BuildTools --silent --accept-package-agreements --accept-source-agreements `
            --override "--quiet --wait --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.Windows11SDK.22621 --includeRecommended"
        Warn "VS Build Tools installed. You may need to restart PowerShell."
    } else {
        Log "MSVC already installed"
    }
}

# ── 2. LLVM (required for bindgen / libclang.dll) ─────────────────────────────
if (-not $SkipLLVM) {
    $llvm = Get-Command clang -ErrorAction SilentlyContinue
    if (-not $llvm) {
        Log "Installing LLVM..."
        winget install --id LLVM.LLVM --silent --accept-package-agreements --accept-source-agreements
    } else {
        Log "LLVM already installed"
    }
    # Ensure LLVM is on PATH in this session
    $llvmBin = "C:\Program Files\LLVM\bin"
    if (Test-Path $llvmBin) {
        if ($env:PATH -notlike "*$llvmBin*") {
            $env:PATH += ";$llvmBin"
        }
        $env:LIBCLANG_PATH = $llvmBin
    }
}

# ── 2b. CMake (required by llama-cpp-sys-2 build script) ─────────────────────
$cmake = Get-Command cmake -ErrorAction SilentlyContinue
if (-not $cmake) {
    Log "Installing CMake..."
    winget install --id Kitware.CMake --silent --accept-package-agreements --accept-source-agreements
} else {
    Log "CMake already installed"
}
$cmakeBin = "C:\Program Files\CMake\bin"
if (Test-Path $cmakeBin) {
    if ($env:PATH -notlike "*$cmakeBin*") {
        $env:PATH += ";$cmakeBin"
    }
}

# ── 3. Rustup ─────────────────────────────────────────────────────────────────
if (-not $SkipRust) {
    if (-not (Test-Command rustup)) {
        Log "Installing Rustup..."
        winget install --id Rustlang.Rustup --silent --accept-package-agreements --accept-source-agreements
        # Refresh PATH
        $env:PATH += ";$env:USERPROFILE\.cargo\bin"
        Warn "Rustup installed. Restart PowerShell if Rust commands fail."
    } else {
        Log "Rustup already installed — updating..."
        rustup update stable
    }
    rustup default stable
    rustup target add x86_64-pc-windows-msvc
    Log "Rust $(rustc --version 2>&1)"
}

# ── 4. Bun ────────────────────────────────────────────────────────────────────
if (-not (Test-Command bun)) {
    Log "Installing Bun..."
    powershell -c "irm bun.sh/install.ps1 | iex"
    $env:PATH += ";$env:USERPROFILE\.bun\bin"
} else {
    Log "Bun $(bun --version) already installed"
}

# ── 5. Frontend Bun dependencies ─────────────────────────────────────────────
Log "Installing frontend Bun dependencies..."
Push-Location frontend
bun install --frozen-lockfile
Pop-Location

if (Test-Path "server/dashboard/package.json") {
    Log "Installing admin dashboard Bun dependencies..."
    Push-Location server/dashboard
    bun install --frozen-lockfile
    Pop-Location
}

# ── 6. Python venv for course generation + admin server ──────────────────────
$python = "python"
if (-not (Test-Command python)) {
    if (Test-Command python3) { $python = "python3" }
    else { Warn "Python not found — skipping venv setup. Install Python 3.11+ and re-run." }
}

if (Test-Command $python) {
    Log "Creating admin-venv..."
    & $python -m venv admin-venv

    Log "Installing Python dependencies..."
    $pip = "admin-venv\Scripts\pip.exe"
    & $pip install --upgrade pip
    & $pip install -r tools\course_gen\requirements.txt
}

# ── Done ──────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host ("━" * 55) -ForegroundColor Cyan
Write-Host "  ✅  Dev environment ready!" -ForegroundColor Green
Write-Host ""
Write-Host "  Build the app:      cargo tauri build" -ForegroundColor White
Write-Host "  Run in dev mode:    .\scripts\dev-tauri.ps1" -ForegroundColor White
Write-Host "  Frontend only:      cd frontend; bun run dev" -ForegroundColor White
Write-Host ""
Write-Host "  Generate a course (in 2 terminals):" -ForegroundColor White
Write-Host "    Term 1: admin-venv\Scripts\activate" -ForegroundColor DarkGray
Write-Host "             .\tools\course_gen\start-server.ps1" -ForegroundColor DarkGray
Write-Host "    Term 2: admin-venv\Scripts\activate" -ForegroundColor DarkGray
Write-Host "             python tools\course_gen\generate_wiki.py <course-id>" -ForegroundColor DarkGray
Write-Host ""
Write-Host "  Admin server:" -ForegroundColor White
Write-Host "    admin-venv\Scripts\activate" -ForegroundColor DarkGray
Write-Host "    cd server; uvicorn main:app --reload" -ForegroundColor DarkGray
Write-Host ("━" * 55) -ForegroundColor Cyan
Write-Host ""
Warn "If 'cargo tauri build' fails with libclang errors, set:"
Write-Host '  $env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"' -ForegroundColor DarkGray
Write-Host '  $env:PATH += ";C:\Program Files\CMake\bin;C:\Program Files\LLVM\bin"' -ForegroundColor DarkGray
Write-Host "  and re-run in a fresh terminal after reboot." -ForegroundColor DarkGray
