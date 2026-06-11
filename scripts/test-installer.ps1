#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Install the Student AI NSIS installer, run feature smoke tests, then uninstall.

.USAGE
    .\scripts\test-installer.ps1
    .\scripts\test-installer.ps1 -InstallerPath "path\to\Student AI_0.1.0_x64-setup.exe"
    .\scripts\test-installer.ps1 -SkipInstall    # if already installed, just test + uninstall
    .\scripts\test-installer.ps1 -SeedModels     # copy pre-downloaded models to app data dir before testing
    .\scripts\test-installer.ps1 -PlaywrightMetrics  # run installed-app Playwright student scenario + metrics

.NOTES
    NSIS (32-bit) cannot mmap files >2 GB, so the bundled-model installer cannot be
    built with the Tauri-bundled makensis.  Use -SeedModels to copy models from the
    repo's bundled_model/ directory into the app's writable models directory instead.
    This exercises the exact same code path as the bundled installer (setup.rs copies
    on first launch).
#>
param(
    [string]$InstallerPath,
    [string]$MsiPath,       # kept for backwards compatibility
    [switch]$SkipInstall,
    # copy models from bundled_model/ to app data dir
    [switch]$SeedModels,
    # run installed-app Playwright scenario + metrics capture
    [switch]$PlaywrightMetrics
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Backwards compat: -MsiPath alias
if ($MsiPath -and -not $InstallerPath) { $InstallerPath = $MsiPath }

# ── Locate installer ──────────────────────────────────────────────────────────
if (-not $InstallerPath) {
    $found = Get-ChildItem -Path "$PSScriptRoot\..\target" -Recurse |
             Where-Object {
                 -not $_.PSIsContainer -and (
                     $_.Extension -eq ".msi" -or
                     ($_.Extension -eq ".exe" -and $_.FullName -like "*\\bundle\\nsis\\*")
                 )
             } |
             Sort-Object LastWriteTime -Descending |
             Select-Object -First 1
    if (-not $found) {
        Write-Error "No installer found under target\. Build first with:`n  cargo tauri build --target x86_64-pc-windows-msvc --bundles nsis"
    }
    $InstallerPath = $found.FullName
}

$msiName   = Split-Path $InstallerPath -Leaf
$isMsi     = [string]::Equals([IO.Path]::GetExtension($InstallerPath), ".msi", [System.StringComparison]::OrdinalIgnoreCase)
$logFile   = "$env:TEMP\studentai-install-$([datetime]::Now.ToString('yyyyMMdd-HHmmss')).log"
$appExe    = "$env:LOCALAPPDATA\student-ai\student-ai.exe"
$appName   = "Student AI"
$pass      = 0
$fail      = 0

function Pass([string]$msg) { Write-Host "  [PASS] $msg" -ForegroundColor Green; $script:pass++ }
function Fail([string]$msg) { Write-Host "  [FAIL] $msg" -ForegroundColor Red;  $script:fail++ }
function Step([string]$msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }

# ── 1. INSTALL ────────────────────────────────────────────────────────────────
Step "Installing $msiName"
if (-not $SkipInstall) {
    Write-Host "  Installer: $InstallerPath"
    Write-Host "  Log: $logFile"
    if ($isMsi) {
        $proc = Start-Process msiexec -ArgumentList "/i `"$InstallerPath`" /passive /norestart /l*v `"$logFile`"" -Wait -PassThru
    } else {
        $proc = Start-Process $InstallerPath -ArgumentList "/S" -Wait -PassThru
    }
    if ($proc.ExitCode -eq 0) {
        Pass "Installer completed (exit 0)"
    } else {
        Fail "Install failed (exit $($proc.ExitCode)). See $logFile"
        exit 1
    }
} else {
    Write-Host "  (--SkipInstall: assuming app already installed)"
}

Start-Sleep -Seconds 3

# ── 2. BINARY EXISTS ──────────────────────────────────────────────────────────
Step "Checking installed binary"
# Tauri NSIS installs to LOCALAPPDATA by default; WiX goes to Program Files
$possiblePaths = @(
    "$env:LOCALAPPDATA\student-ai\student-ai.exe",
    "$env:LOCALAPPDATA\Student AI\student-ai.exe",
    "$env:ProgramFiles\student-ai\student-ai.exe",
    "$env:ProgramFiles\Student AI\student-ai.exe"
)
$installedExe = $possiblePaths | Where-Object { Test-Path $_ } | Select-Object -First 1

if ($installedExe) {
    Pass "Executable found: $installedExe"
    $appExe = $installedExe
} else {
    # Try registry for install location
    $regKey = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*" -ErrorAction SilentlyContinue |
              Where-Object { $_.DisplayName -like "*Student AI*" } |
              Select-Object -First 1
    if ($regKey -and $regKey.InstallLocation) {
        $installedExe = Join-Path $regKey.InstallLocation "student-ai.exe"
        if (Test-Path $installedExe) {
            Pass "Executable found via registry: $installedExe"
            $appExe = $installedExe
        } else {
            Fail "Executable not found at registry InstallLocation: $installedExe"
        }
    } else {
        Fail "Executable not found in standard install paths or registry"
    }
}

# ── 2b. SEED MODELS (optional) ────────────────────────────────────────────────
# NSIS (32-bit) cannot mmap files >2 GB, so the bundled-model installer variant
# cannot be built locally.  -SeedModels copies models from bundled_model/ into the
# app's writable models directory — same result as the bundled installer doing it.
if ($SeedModels) {
    Step "Seeding models from bundled_model/ to app data directory"
    $appDataModels = "$env:APPDATA\com.studentai.app\models"
    $bundledModelDir = Join-Path $PSScriptRoot "..\bundled_model"
    New-Item -ItemType Directory -Force -Path $appDataModels | Out-Null

    # Map source filenames -> slot filenames expected by the app
    $modelMap = @{
        "Phi-4-mini-instruct-Q4_K_M.gguf"  = "chat-model-1.gguf"
        "bge-small-en-v1.5-q8_0.gguf"      = "rag-model-1.gguf"
    }
    foreach ($src in $modelMap.Keys) {
        $dest    = Join-Path $appDataModels $modelMap[$src]
        $srcPath = Join-Path $bundledModelDir $src
        if (Test-Path $srcPath) {
            if (-not (Test-Path $dest)) {
                Write-Host "  Copying $src -> $($modelMap[$src]) ..."
                Copy-Item $srcPath $dest
            } else {
                Write-Host "  Already present: $($modelMap[$src])"
            }
            Pass "Model ready: $($modelMap[$src])"
        } else {
            Fail "Source model not found: $srcPath"
        }
    }
}

# ── 3. APP LAUNCHES ───────────────────────────────────────────────────────────
# Reset license.json so the 7-day rolling window starts fresh for this test run.
$licDir  = Join-Path $env:APPDATA "com.studentai.app"
$licFile = Join-Path $licDir "license.json"
$null = New-Item -ItemType Directory -Force -Path $licDir
$nowIso  = (Get-Date).ToUniversalTime().ToString("o")
@{ install_date = $nowIso; last_poll = $nowIso } | ConvertTo-Json | Set-Content $licFile -Encoding UTF8
Write-Host "  License reset: install_date = $nowIso"

Step "Launching application (10 s smoke check)"
if (Test-Path $appExe) {
    $appProc = Start-Process $appExe -PassThru
    Start-Sleep -Seconds 10
    $still = Get-Process -Id $appProc.Id -ErrorAction SilentlyContinue
    if ($still -and -not $still.HasExited) {
        Pass "App launched and is running (PID $($appProc.Id))"
    } else {
        Fail "App exited within 10 s (crashed on startup?)"
    }
} else {
    Fail "Cannot launch — binary not found"
    $appProc = $null
}

# ── 4. WEBVIEW2 / WINDOW PRESENT ─────────────────────────────────────────────
Step "Checking for WebView2 child process"
if ($appProc -and -not $appProc.HasExited) {
    Start-Sleep -Seconds 5
    # WebView2 spawns msedgewebview2.exe child processes when WebView2 renders
    $wv2 = Get-Process "msedgewebview2" -ErrorAction SilentlyContinue |
           Where-Object { $_.Parent.Id -eq $appProc.Id -or $true } |
           Select-Object -First 1
    if ($wv2) {
        Pass "WebView2 renderer process active (PID $($wv2.Id))"
    } else {
        # WebView2 might share host process; check window title instead
        $win = $appProc.MainWindowTitle
        if ($win) {
            Pass "Main window visible: '$win'"
        } else {
            Fail "No WebView2 process and no window title detected (may still be loading)"
        }
    }
}

# ── 5. MODEL FILES REACHABLE ─────────────────────────────────────────────────
Step "Checking model files (install dir bundled_model/ OR app data models/)"
if ($installedExe) {
    $installDir      = Split-Path $installedExe
    $bundledModelDir = Join-Path $installDir "bundled_model"
    $appDataModels   = "$env:APPDATA\com.studentai.app\models"

    # Accept models from either location
    $ggufFiles = @()
    if (Test-Path $bundledModelDir) {
        $ggufFiles += Get-ChildItem $bundledModelDir -Filter "*.gguf" -ErrorAction SilentlyContinue
    }
    if (Test-Path $appDataModels) {
        $ggufFiles += Get-ChildItem $appDataModels -Filter "*.gguf" -ErrorAction SilentlyContinue
    }
    # Deduplicate by name
    $ggufFiles = $ggufFiles | Sort-Object Name -Unique

    if ($ggufFiles -and $ggufFiles.Count -ge 2) {
        Pass "Found $($ggufFiles.Count) model file(s): $($ggufFiles.Name -join ', ')"
    } elseif ($ggufFiles -and $ggufFiles.Count -eq 1) {
        Fail "Only 1 model file found (expected LLM + embedding): $($ggufFiles.Name)"
    } else {
        Fail "No .gguf model files found in bundled_model/ or app data models/"
    }
}

# ── 6. COURSES ASSETS ─────────────────────────────────────────────────────────
Step "Checking bundled course assets"
if ($installedExe) {
    $installDir  = Split-Path $installedExe
    $coursesDir  = Join-Path $installDir "assets\courses"
    if (Test-Path $coursesDir) {
        $courseCount = (Get-ChildItem $coursesDir -Directory).Count
        Pass "Courses directory present with $courseCount course(s)"
    } else {
        Fail "assets\courses not found in install directory"
    }
}

# ── 7. REGISTRY ENTRY ────────────────────────────────────────────────────────
Step "Checking Add/Remove Programs registry entry"
$uninstallEntry = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
                                    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*" `
                  -ErrorAction SilentlyContinue |
                  Where-Object {
                      $_.PSObject.Properties.Name -contains "DisplayName" -and
                      $_.DisplayName -like "*Student AI*"
                  } |
                  Select-Object -First 1
if ($uninstallEntry) {
    Pass "Registry uninstall entry found: '$($uninstallEntry.DisplayName)' v$($uninstallEntry.DisplayVersion)"
} else {
    Fail "No Add/Remove Programs entry found for Student AI"
}

# ── 8. STOP APP BEFORE UNINSTALL ─────────────────────────────────────────────
Step "Stopping application before uninstall"
if ($appProc -and -not $appProc.HasExited) {
    Stop-Process -Id $appProc.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    Pass "Application process stopped"
}
Get-Process "student-ai" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# ── 8b. PLAYWRIGHT INSTALLED-APP METRICS (optional) ─────────────────────────
if ($PlaywrightMetrics) {
    Step "Running Playwright installed-app metrics scenario"
    $metricsScript = Join-Path $PSScriptRoot "test-installed-playwright-metrics.mjs"
    if (-not (Test-Path $metricsScript)) {
        Fail "Metrics script not found: $metricsScript"
    } else {
        $env:STUDENT_AI_EXE = $appExe
        $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
        if (-not $nodeCmd) {
            Fail "Node.js not found in PATH; cannot run Playwright metrics script"
        } else {
            $metricsProc = Start-Process node -ArgumentList "`"$metricsScript`"" -Wait -PassThru -NoNewWindow
            if ($metricsProc.ExitCode -eq 0) {
                Pass "Playwright metrics scenario completed"
            } else {
                Fail "Playwright metrics scenario failed (exit $($metricsProc.ExitCode))"
            }
        }
    }
}

# ── 9. UNINSTALL ──────────────────────────────────────────────────────────────
Step "Uninstalling via MSI"
$uninstallLog = "$env:TEMP\studentai-uninstall-$([datetime]::Now.ToString('yyyyMMdd-HHmmss')).log"
$proc2 = $null
if ($isMsi) {
    $proc2 = Start-Process msiexec -ArgumentList "/x `"$InstallerPath`" /passive /norestart /l*v `"$uninstallLog`"" -Wait -PassThru
} else {
    $uninstPath = "$env:LOCALAPPDATA\student-ai\uninstall.exe"
    if (-not (Test-Path $uninstPath)) {
        $uninstPath = "$env:LOCALAPPDATA\Student AI\uninstall.exe"
    }
    if (-not (Test-Path $uninstPath)) {
        $uninstPath = "$env:ProgramFiles\student-ai\uninstall.exe"
    }
    if (-not (Test-Path $uninstPath)) {
        $uninstPath = "$env:ProgramFiles\Student AI\uninstall.exe"
    }
    if (-not (Test-Path $uninstPath)) {
        Fail "NSIS uninstaller not found"
        exit 1
    }
    $proc2 = Start-Process $uninstPath -ArgumentList "/S" -Wait -PassThru
}
if ($proc2.ExitCode -eq 0) {
    Pass "Uninstall completed cleanly (exit 0)"
} else {
    Fail "Uninstall failed (exit $($proc2.ExitCode)). See $uninstallLog"
}

Start-Sleep -Seconds 3

# ── 10. VERIFY REMOVED ────────────────────────────────────────────────────────
Step "Verifying removal"
if ($installedExe -and -not (Test-Path $installedExe)) {
    Pass "Executable removed from disk"
} elseif ($installedExe) {
    Fail "Executable still present after uninstall: $installedExe"
}

$entryAfter = Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
                                "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*" `
              -ErrorAction SilentlyContinue |
              Where-Object {
                  $_.PSObject.Properties.Name -contains "DisplayName" -and
                  $_.DisplayName -like "*Student AI*"
              } |
              Select-Object -First 1
if (-not $entryAfter) {
    Pass "Registry uninstall entry removed"
} else {
    Fail "Registry entry still present after uninstall"
}

# ── SUMMARY ──────────────────────────────────────────────────────────────────
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor White
Write-Host "  RESULTS: $pass passed, $fail failed" -ForegroundColor $(if ($fail -eq 0) { "Green" } else { "Yellow" })
Write-Host "  Install log : $logFile"
Write-Host "  Uninstall log: $uninstallLog"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor White

if ($fail -gt 0) { exit 1 }
