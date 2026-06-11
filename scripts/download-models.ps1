# download-models.ps1
# Downloads GGUF models for Student AI — development / manual install on Windows.
# Run from the project root: .\scripts\download-models.ps1
#
# Model URLs are the same ones baked into the app via src-tauri\models.toml.
# If you change models.toml, update the entries below to match.
#
# On-disk filenames MUST match what the app expects:
#   LLM    → chat-model.gguf
#   Embed  → rag-model.gguf

param(
    [string]$ModelsDir = "$env:LOCALAPPDATA\StudentAI\models",
    [switch]$UseHfCli   # prefer huggingface-cli if installed
)

New-Item -ItemType Directory -Force -Path $ModelsDir | Out-Null

Write-Host "Student AI — Model Downloader" -ForegroundColor Cyan
Write-Host "Destination : $ModelsDir`n"

# ── Model list (keep in sync with src-tauri\models.toml) ──────────────────────
$Models = @(
    @{
        Name    = "Phi-4-mini-instruct Q4_K_M  (LLM — ~1.8 GB)"
        File    = "chat-model.gguf"
        HfRepo  = "unsloth/Phi-4-mini-instruct-GGUF"
        HfFile  = "Phi-4-mini-instruct-Q4_K_M.gguf"
        Url     = "https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf?download=true"
        PageUrl = "https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF"
        SizeMB  = 1800
    },
    @{
        Name    = "BGE-small-en-v1.5 Q8_0  (Embeddings — ~33 MB)"
        File    = "rag-model.gguf"
        HfRepo  = "CompendiumLabs/bge-small-en-v1.5-gguf"
        HfFile  = "bge-small-en-v1.5-q8_0.gguf"
        Url     = "https://huggingface.co/CompendiumLabs/bge-small-en-v1.5-gguf/resolve/main/bge-small-en-v1.5-q8_0.gguf"
        PageUrl = "https://huggingface.co/CompendiumLabs/bge-small-en-v1.5-gguf"
        SizeMB  = 33
    }
)

# Check if huggingface-cli is available
$HfCliAvailable = $null -ne (Get-Command "huggingface-cli" -ErrorAction SilentlyContinue)

foreach ($Model in $Models) {
    $Dest = Join-Path $ModelsDir $Model.File

    if (Test-Path $Dest) {
        $SizeMB = [math]::Round((Get-Item $Dest).Length / 1MB, 1)
        Write-Host "  [SKIP] $($Model.Name)" -ForegroundColor Yellow
        Write-Host "         $Dest  ($SizeMB MB on disk)" -ForegroundColor DarkGray
        continue
    }

    Write-Host "  [DOWN] $($Model.Name)" -ForegroundColor Green
    Write-Host "         HF page : $($Model.PageUrl)" -ForegroundColor DarkGray
    Write-Host "         Direct  : $($Model.Url)" -ForegroundColor DarkGray

    $ok = $false

    # Method 1: huggingface-cli (resumable, shows progress)
    if ($HfCliAvailable -or $UseHfCli) {
        Write-Host "         Using huggingface-cli..." -ForegroundColor DarkGray
        huggingface-cli download $Model.HfRepo $Model.HfFile --local-dir $ModelsDir --local-dir-use-symlinks False
        if ($LASTEXITCODE -eq 0 -and (Test-Path $Dest)) {
            # hf-cli saves with original name; rename if needed
            $HfDest = Join-Path $ModelsDir $Model.HfFile
            if ($HfDest -ne $Dest -and (Test-Path $HfDest)) {
                Move-Item $HfDest $Dest -Force
            }
            $ok = $true
        }
    }

    # Method 2: Invoke-WebRequest fallback
    if (-not $ok) {
        Write-Host "         Using Invoke-WebRequest..." -ForegroundColor DarkGray
        try {
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $Model.Url -OutFile $Dest -UseBasicParsing
            $ok = $true
        } catch {
            Write-Host "  [FAIL] $_" -ForegroundColor Red
            Write-Host "         Manual download: $($Model.PageUrl)" -ForegroundColor Yellow
            Write-Host "         Save as        : $Dest" -ForegroundColor Yellow
        }
    }

    if ($ok) {
        $SizeMB = [math]::Round((Get-Item $Dest).Length / 1MB, 1)
        Write-Host "  [ OK ] Saved $SizeMB MB -> $Dest" -ForegroundColor Green
    }
}

Write-Host "`nDone. Models directory: $ModelsDir" -ForegroundColor Cyan
Write-Host "Start the app: cargo tauri dev" -ForegroundColor DarkGray
