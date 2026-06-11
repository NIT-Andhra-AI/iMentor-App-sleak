#!/usr/bin/env pwsh
# Retry the 3 configs that failed with "No model loaded" (Permission denied race).
# Fix: directly copy models to AppData instead of relying on NSIS hook.
# No rebuild needed — the installers from the matrix run are reused.
#
# Usage: pwsh scripts/run-model-matrix-retry.ps1

$ErrorActionPreference = "Stop"
$ROOT = "d:\app2\app"
$MODELS_APPDATA = "C:\Users\sriph\AppData\Roaming\com.studentai.app\models"
$INSTALLER = "$ROOT\dist\windows\StudentAI-net-setup-x86_64.exe"

function Set-Config($source_file, $file_name, $slot, $size_mb, $url, $no_think) {
    $content = Get-Content "$ROOT\workspace.toml" -Raw
    $block = @"
[models.llm]
display_name = "AI Language Model"
source_file  = "$source_file"
file_name    = "$file_name"
url          = "$url"
size_mb      = $size_mb
no_think     = $($no_think.ToString().ToLower())
"@
    $content = $content -replace '(?s)\[models\.llm\].*?(?=\r?\n\r?\n|\[models\.embedding\])', $block
    Set-Content "$ROOT\workspace.toml" $content -Encoding UTF8
    Write-Host "  √ workspace.toml updated"
}

function Build-App {
    Write-Host "  🔨 Building..."
    Set-Location $ROOT
    python scripts/gen-config.py 2>&1 | Select-Object -Last 2 | Write-Host
    $env:RUSTFLAGS = "-C target-cpu=native"
    $env:LLAMA_LIB_PROFILE = "Release"
    cargo tauri build --target x86_64-pc-windows-msvc 2>&1 |
        Select-String "Finished|error\[|Built application" | Select-Object -Last 2 | Write-Host
    Copy-Item "$ROOT\target\x86_64-pc-windows-msvc\release\bundle\nsis\Student AI_0.1.0_x64-setup.exe" $INSTALLER -Force
    Write-Host "  √ Installer ready"
}

function Install-App {
    Write-Host "  📦 Installing..."
    $u = "C:\Users\sriph\AppData\Local\Student AI\uninstall.exe"
    if (Test-Path $u) { & $u /S; Start-Sleep -Seconds 10 }
    & $INSTALLER /S
    $t = 0
    while ($t -lt 120) {
        Start-Sleep 5; $t += 5
        if (Test-Path "C:\Users\sriph\AppData\Local\Student AI\student-ai.exe") {
            Write-Host "  √ Installed after ${t}s"; break
        }
    }
    # Wait for NSIS child process to fully exit — it may still be copying llm.gguf
    $deadline = (Get-Date).AddSeconds(30)
    while ((Get-Date) -lt $deadline) {
        $nsis = Get-Process -Name "*setup*","*nsis*" -ErrorAction SilentlyContinue |
                    Where-Object { $_.Path -like "*StudentAI*" -or $_.Path -like "*setup*" }
        if (-not $nsis) { break }
        Start-Sleep -Seconds 2
    }
    Start-Sleep -Seconds 5   # extra buffer for file handles to close
    $today = (Get-Date).ToString("yyyy-MM-dd")
    '{"install_date":"' + $today + '","last_active":"' + $today + '","activated":true}' |
        Set-Content "C:\Users\sriph\AppData\Roaming\com.studentai.app\license.json" -Encoding UTF8
}

function Install-Model($source_file, $target_file) {
    # Resolve source: prefer models/, fall back to bundled_model/
    $src = "$ROOT\models\$source_file"
    if (-not (Test-Path $src)) { $src = "$ROOT\bundled_model\$source_file" }
    if (-not (Test-Path $src)) {
        Write-Host "  ❌ Cannot install model — not found: $source_file"
        return
    }
    $dest = "$MODELS_APPDATA\$target_file"
    New-Item -ItemType Directory -Force -Path $MODELS_APPDATA | Out-Null
    # Wait until dest file is not locked (NSIS may still be finishing its own copy)
    $waited = 0
    while ($waited -lt 60) {
        try {
            $fs = [System.IO.File]::Open($dest, 'OpenOrCreate', 'ReadWrite', 'None')
            $fs.Close()
            break
        } catch {
            Write-Host "  ⏳ Waiting for file lock to release ($waited s)..."
            Start-Sleep -Seconds 2; $waited += 2
        }
    }
    Copy-Item $src $dest -Force
    Write-Host "  √ Model copied to AppData: $source_file → $target_file ($([math]::Round((Get-Item $src).Length/1GB,2)) GB)"
}

function Run-Benchmark($tag) {
    Write-Host "  ⏱️  Benchmark ($tag)..."
    Set-Location $ROOT
    node scripts/test-installed-playwright-metrics.mjs 2>&1 |
        Select-String "prompt|TTFT|saved" | Select-Object -Last 6 | Write-Host
    $dest = "$ROOT\reports\installed-metrics-$tag.json"
    Copy-Item "$ROOT\reports\installed-playwright-metrics.json" $dest -Force
    Write-Host "  √ Saved: $dest"
    return ($dest)
}

# ── Retry configs that had "No model loaded" errors ──────────────────────────
$CONFIGS = @(
    @{
        tag          = "qwen3-4b-thinking"
        label        = "Qwen3-4B (with thinking)"
        source_file  = "Qwen3-4B-Q4_K_M.gguf"
        file_name    = "chat-model-5.gguf"
        size_mb      = 2330
        url          = "https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf?download=true"
        no_think     = $false
    },
    @{
        tag          = "phi4-mini-instant"
        label        = "Phi-4-mini (instant/no-thinking)"
        source_file  = "Phi-4-mini-instruct-Q4_K_M.gguf"
        file_name    = "chat-model-1.gguf"
        size_mb      = 2400
        url          = "https://huggingface.co/bartowski/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf?download=true"
        no_think     = $true
    },
    @{
        tag          = "phi4-mini-thinking"
        label        = "Phi-4-mini (with thinking)"
        source_file  = "Phi-4-mini-instruct-Q4_K_M.gguf"
        file_name    = "chat-model-1.gguf"
        size_mb      = 2400
        url          = "https://huggingface.co/bartowski/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf?download=true"
        no_think     = $false
    }
)

$start = Get-Date
Write-Host "`n=== Model Matrix Retry (3 failed configs) ==="
Write-Host "Start: $($start.ToString('HH:mm'))"
Write-Host "Fix: direct AppData copy bypasses NSIS race condition"
Write-Host ""

foreach ($c in $CONFIGS) {
    Write-Host "`n[$($c.label)]"
    Set-Config $c.source_file $c.file_name $c.file_name.Split('-')[2] $c.size_mb $c.url $c.no_think
    Build-App
    Install-App
    Install-Model $c.source_file $c.file_name   # ← the fix
    Run-Benchmark $c.tag
    Write-Host "  √ Done: $($c.label)"
}

# ── Restore optimal config ───────────────────────────────────────────────────
Write-Host "`n[Restoring optimal config: Qwen3-4B instant]"
Set-Config "Qwen3-4B-Q4_K_M.gguf" "chat-model-5.gguf" "5" 2330 `
    "https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf?download=true" $true

Write-Host "`n=== Retry complete ==="
Write-Host "Elapsed: $([math]::Round(((Get-Date) - $start).TotalMinutes)) minutes"
Write-Host ""
Write-Host "All results:"
Get-ChildItem "$ROOT\reports\installed-metrics-*.json" |
    Sort-Object Name |
    ForEach-Object {
        $j = Get-Content $_.FullName | ConvertFrom-Json
        # Skip entries with "No model loaded" in reply
        $t1 = $j.interactions[0].latency_ms.first_token
        $t2 = $j.interactions[1].latency_ms.first_token
        $t3 = $j.interactions[2].latency_ms.first_token
        $snippet1 = $j.interactions[0].reply_snippet
        $invalid = $snippet1 -like "*No model loaded*"
        $marker = if ($invalid) { " [INVALID]" } else { "" }
        $avg = if ($t1 -and $t2 -and $t3) { [math]::Round(($t1+$t2+$t3)/3) } else { 0 }
        Write-Host ("  {0,-40} T1={1,7}ms  T2={2,7}ms  T3={3,7}ms  Avg={4,7}ms{5}" -f $_.BaseName, $t1, $t2, $t3, $avg, $marker)
    }

Write-Host ""
Write-Host "Known results (from prior runs):"
$known = @(
    @{ name="qwen3-4b-instant";    t1=5903; t2=3282; t3=3322 },
    @{ name="qwen35-4b-instant";   t1=8256; t2=9797; t3=10263 }
)
foreach ($k in $known) {
    $avg = [math]::Round(($k.t1+$k.t2+$k.t3)/3)
    Write-Host ("  {0,-40} T1={1,7}ms  T2={2,7}ms  T3={3,7}ms  Avg={4,7}ms" -f $k.name, $k.t1, $k.t2, $k.t3, $avg)
}
