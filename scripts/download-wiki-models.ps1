# download-wiki-models.ps1
# Downloads GGUF models for wiki building — ADMIN machine only (16 GB GPU)
# Run from the project root: .\scripts\download-wiki-models.ps1
#
# These models run on the developer/admin GPU machine to build course wikis.
# Students do NOT need these — they receive the pre-built wiki with the app.
#
# Sources: unsloth (Qwen2.5-14B), ggml-org (Gemma-3-4B) — all Q4_K_M

param(
    [string]$ModelsDir = "C:\WikiModels",
    [ValidateSet("qwen14b", "gemma4b", "both")]
    [string]$Model = "qwen14b"
)

New-Item -ItemType Directory -Force -Path $ModelsDir | Out-Null

Write-Host "Student AI — Admin Wiki Model Downloader" -ForegroundColor Cyan
Write-Host "Destination : $ModelsDir`n"

$AllModels = @{
    "qwen14b" = @{
        Name    = "Qwen2.5-14B-Instruct Q4_K_M  (~8.5 GB VRAM, best quality)"
        File    = "Qwen2.5-14B-Instruct-Q4_K_M.gguf"
        HfRepo  = "unsloth/Qwen2.5-14B-Instruct-GGUF"
        HfFile  = "Qwen2.5-14B-Instruct-Q4_K_M.gguf"
        Url     = "https://huggingface.co/unsloth/Qwen2.5-14B-Instruct-GGUF/resolve/main/Qwen2.5-14B-Instruct-Q4_K_M.gguf"
        PageUrl = "https://huggingface.co/unsloth/Qwen2.5-14B-Instruct-GGUF"
        SizeMB  = 8700
        Gated   = $false
    }
    "gemma4b" = @{
        Name    = "Gemma-3-4B-IT Q4_K_M  (~2.5 GB VRAM, faster)"
        File    = "gemma-3-4b-it-Q4_K_M.gguf"
        HfRepo  = "ggml-org/gemma-3-4b-it-GGUF"
        HfFile  = "gemma-3-4b-it-Q4_K_M.gguf"
        Url     = "https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf"
        PageUrl = "https://huggingface.co/ggml-org/gemma-3-4b-it-GGUF"
        SizeMB  = 2500
        Gated   = $false
    }
}

$ToDownload = if ($Model -eq "both") { $AllModels.Values } else { @($AllModels[$Model]) }

# Check huggingface-cli
$HfCliAvailable = $null -ne (Get-Command "huggingface-cli" -ErrorAction SilentlyContinue)
if (-not $HfCliAvailable) {
    Write-Host "TIP: Install huggingface-cli for resumable downloads:" -ForegroundColor Yellow
    Write-Host "     pip install huggingface_hub`n" -ForegroundColor Yellow
}

foreach ($M in $ToDownload) {
    $Dest = Join-Path $ModelsDir $M.File

    Write-Host "Model   : $($M.Name)" -ForegroundColor Cyan

    if (Test-Path $Dest) {
        $SizeMB = [math]::Round((Get-Item $Dest).Length / 1MB, 1)
        Write-Host "[SKIP] Already exists ($SizeMB MB): $Dest`n" -ForegroundColor Yellow
        continue
    }

    $ok = $false

    if ($HfCliAvailable) {
        Write-Host "Downloading via huggingface-cli (resumable)..." -ForegroundColor Green
        huggingface-cli download $M.HfRepo $M.HfFile --local-dir $ModelsDir --local-dir-use-symlinks False
        if ($LASTEXITCODE -eq 0) {
            $HfPath = Join-Path $ModelsDir $M.HfFile
            if ($HfPath -ne $Dest -and (Test-Path $HfPath)) {
                Move-Item $HfPath $Dest -Force
            }
            if (Test-Path $Dest) { $ok = $true }
        }
    }

    if (-not $ok) {
        Write-Host "Downloading via Invoke-WebRequest (~$($M.SizeMB) MB, no resume)..." -ForegroundColor Green
        try {
            $ProgressPreference = 'SilentlyContinue'
            Invoke-WebRequest -Uri $M.Url -OutFile $Dest -UseBasicParsing
            $ok = $true
        } catch {
            Write-Host "[FAIL] $_" -ForegroundColor Red
        }
    }

    if ($ok) {
        $SizeMB = [math]::Round((Get-Item $Dest).Length / 1MB, 1)
        Write-Host "[ OK ] $SizeMB MB -> $Dest" -ForegroundColor Green
        Write-Host "Build wiki: python scripts/build-wiki.py --model `"$Dest`" --course machine-learning`n" -ForegroundColor DarkGray
    } else {
        Write-Host "Manual download instructions:" -ForegroundColor Yellow
        Write-Host "  1. Visit: $($M.PageUrl)" -ForegroundColor Yellow
        Write-Host "  2. Download: $($M.HfFile)" -ForegroundColor Yellow
        Write-Host "  3. Save to: $Dest`n" -ForegroundColor Yellow
    }
}

Write-Host "Done." -ForegroundColor Cyan
