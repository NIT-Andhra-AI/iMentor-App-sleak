# tools/course_gen/start-server.ps1
# Start llama-cpp-python's OpenAI-compatible server for course generation (Windows).
#
# Usage (from project root):
#   .\tools\course_gen\start-server.ps1
#   .\tools\course_gen\start-server.ps1 qwen3.5-4b-q4_k_m.gguf
#   .\tools\course_gen\start-server.ps1 C:\full\path\to\model.gguf
#
# After starting, in another terminal run:
#   python tools\course_gen\generate_wiki.py machine-learning
#
# Stop with: Ctrl+C

param(
    [string]$Model = "",
    [int]$Port      = 8080,
    [string]$Host   = "127.0.0.1",
    [int]$NCtx      = 4096,
    [int]$NThreads  = 4
)

$ErrorActionPreference = "Stop"

# ── Resolve models directory (mirrors Tauri app at runtime) ──────────────────
$LocalAppData = $env:LOCALAPPDATA ?? (Join-Path $env:USERPROFILE "AppData\Local")
$ModelsDir    = Join-Path $LocalAppData "StudentAI\models"

# Allow override via environment variable
if ($env:LLM_MODELS_DIR) { $ModelsDir = $env:LLM_MODELS_DIR }

# ── Resolve model path ────────────────────────────────────────────────────────
$DefaultModel = $env:LLM_MODEL_FILE ?? "phi-4-mini-q4_k_m.gguf"

if ($Model -eq "") {
    $ModelPath = Join-Path $ModelsDir $DefaultModel
} elseif ([System.IO.Path]::IsPathRooted($Model)) {
    $ModelPath = $Model
} else {
    $ModelPath = Join-Path $ModelsDir $Model
}

if (-not (Test-Path $ModelPath)) {
    Write-Host "ERROR: Model not found: $ModelPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "Available models in $ModelsDir :" -ForegroundColor Yellow
    $gguf = Get-ChildItem $ModelsDir -Filter "*.gguf" -ErrorAction SilentlyContinue
    if ($gguf) { $gguf | ForEach-Object { Write-Host "  $_" } }
    else { Write-Host "  (none — run: .\scripts\download-models.ps1)" }
    Write-Host ""
    Write-Host "Or set LLM_MODELS_DIR to point to your models folder." -ForegroundColor DarkGray
    exit 1
}

# ── Activate venv if present ──────────────────────────────────────────────────
$ProjectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$Venv        = Join-Path $ProjectRoot "admin-venv"
$VenvActivate = Join-Path $Venv "Scripts\Activate.ps1"

if (Test-Path $VenvActivate) {
    Write-Host "Using venv: $Venv" -ForegroundColor DarkGray
    & $VenvActivate
}

# ── Ensure llama-cpp-python is installed ─────────────────────────────────────
$installed = python -c "import llama_cpp" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "llama-cpp-python not found. Installing..." -ForegroundColor Yellow
    pip install "llama-cpp-python[server]" --upgrade
}

# ── Start server ──────────────────────────────────────────────────────────────
$ModelName = [System.IO.Path]::GetFileNameWithoutExtension($ModelPath)

Write-Host ""
Write-Host ("━" * 50) -ForegroundColor Cyan
Write-Host "  Starting llama-cpp-python server" -ForegroundColor Cyan
Write-Host "  Model  : $ModelName" -ForegroundColor White
Write-Host "  Path   : $ModelPath" -ForegroundColor DarkGray
Write-Host "  URL    : http://${Host}:${Port}/v1" -ForegroundColor White
Write-Host ("━" * 50) -ForegroundColor Cyan
Write-Host ""
Write-Host "Once started, in another terminal run:" -ForegroundColor DarkGray
Write-Host "  python tools\course_gen\generate_wiki.py machine-learning" -ForegroundColor Green
Write-Host ""
Write-Host "Stop with: Ctrl+C" -ForegroundColor DarkGray
Write-Host ""

python -m llama_cpp.server `
    --model $ModelPath `
    --host $Host `
    --port $Port `
    --n_ctx $NCtx `
    --n_threads $NThreads `
    --chat_format chatml `
    --verbose 0
