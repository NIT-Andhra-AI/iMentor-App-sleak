//! Activity-based license enforcement.
//!
//! Auto-uninstall triggers when **either** condition is met (whichever is earlier):
//!   1. `max_install_days` since first launch  (absolute semester/annual limit)
//!   2. `inactivity_days` without a successful internet telemetry poll
//!
//! Thresholds are baked in at build time via `build_config.toml` so students
//! cannot modify them.  The runtime state (install date, last poll) is stored
//! in `license.json` inside the app data directory.

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

// ── Persisted state ─────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct LicenseRecord {
    /// UTC timestamp of the very first app launch.
    pub install_date: DateTime<Utc>,
    /// UTC timestamp of the most recent successful telemetry poll (server reached).
    pub last_poll: DateTime<Utc>,
}

impl LicenseRecord {
    fn new() -> Self {
        let now = Utc::now();
        Self { install_date: now, last_poll: now }
    }
}

// ── Status returned to the frontend ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize)]
pub struct LicenseStatus {
    pub install_date:       String,         // RFC 3339
    pub last_poll:          String,         // RFC 3339
    pub days_since_install: i64,
    pub days_since_poll:    i64,
    /// Days until the **earliest** expiry condition fires (negative = already expired).
    pub days_until_expiry:  i64,
    /// Human-readable reason if expired (None while still active).
    pub expiry_reason:      Option<String>,
    pub is_expired:         bool,
    /// Warning shown when ≤ 14 days remain.
    pub warning_message:    Option<String>,
    pub max_install_days:   i64,
    pub inactivity_days:    i64,
}

// ── Manager ──────────────────────────────────────────────────────────────────

pub struct LicenseManager {
    path:             PathBuf,
    pub record:       LicenseRecord,
    max_install_days: i64,
    inactivity_days:  i64,
}

impl LicenseManager {
    /// Load (or create on first run) the license record.
    pub fn load(app_data_dir: &Path) -> Self {
        let max_install_days = crate::build_config::max_install_days();
        let inactivity_days  = crate::build_config::inactivity_days();
        let path = app_data_dir.join("license.json");

        let record = if path.exists() {
            std::fs::read_to_string(&path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_else(LicenseRecord::new)
        } else {
            // First run — stamp install_date and persist immediately.
            let r = LicenseRecord::new();
            let _ = std::fs::write(&path, serde_json::to_string_pretty(&r).unwrap_or_default());
            r
        };

        Self { path, record, max_install_days, inactivity_days }
    }

    /// Call after a successful telemetry flush — resets the inactivity clock.
    pub fn record_poll(&mut self) {
        self.record.last_poll = Utc::now();
        let _ = std::fs::write(
            &self.path,
            serde_json::to_string_pretty(&self.record).unwrap_or_default(),
        );
    }

    pub fn days_since_install(&self) -> i64 {
        (Utc::now() - self.record.install_date).num_days()
    }

    pub fn days_since_poll(&self) -> i64 {
        (Utc::now() - self.record.last_poll).num_days()
    }

    fn days_until_absolute_expiry(&self) -> i64 {
        if self.max_install_days == 0 { return i64::MAX; }
        self.max_install_days - self.days_since_install()
    }

    fn days_until_inactivity_expiry(&self) -> i64 {
        if self.inactivity_days == 0 { return i64::MAX; }
        self.inactivity_days - self.days_since_poll()
    }

    /// Days until the **earliest** limit fires.  Negative = already expired.
    pub fn days_until_expiry(&self) -> i64 {
        self.days_until_absolute_expiry()
            .min(self.days_until_inactivity_expiry())
    }

    pub fn is_expired(&self) -> bool {
        self.days_until_expiry() < 0
    }

    pub fn expiry_reason(&self) -> Option<String> {
        if self.max_install_days > 0
            && self.days_since_install() >= self.max_install_days
        {
            return Some(format!(
                "{}-day license period has ended (installed {} days ago).",
                self.max_install_days,
                self.days_since_install()
            ));
        }
        if self.inactivity_days > 0
            && self.days_since_poll() >= self.inactivity_days
        {
            return Some(format!(
                "App has been offline/inactive for {} days (limit: {} days).",
                self.days_since_poll(),
                self.inactivity_days
            ));
        }
        None
    }

    fn warning_message(&self) -> Option<String> {
        let days = self.days_until_expiry();
        if days < 0 {
            return Some(format!(
                "⚠ Your Student AI license has expired. The app will be uninstalled shortly."
            ));
        }
        if days <= 14 {
            if self.days_until_inactivity_expiry() <= self.days_until_absolute_expiry() {
                return Some(format!(
                    "⚠ Connect to the internet within {} day(s) to keep Student AI active.",
                    days
                ));
            } else {
                return Some(format!(
                    "⚠ Student AI license expires in {} day(s) ({}-day limit).",
                    days, self.max_install_days
                ));
            }
        }
        None
    }

    pub fn status(&self) -> LicenseStatus {
        LicenseStatus {
            install_date:       self.record.install_date.to_rfc3339(),
            last_poll:          self.record.last_poll.to_rfc3339(),
            days_since_install: self.days_since_install(),
            days_since_poll:    self.days_since_poll(),
            days_until_expiry:  self.days_until_expiry(),
            expiry_reason:      self.expiry_reason(),
            is_expired:         self.is_expired(),
            warning_message:    self.warning_message(),
            max_install_days:   self.max_install_days,
            inactivity_days:    self.inactivity_days,
        }
    }
}

// ── Self-uninstall ───────────────────────────────────────────────────────────

/// Trigger a silent self-uninstall and exit the process.
///
/// On Windows: writes a PowerShell script that locates the MSI product by
/// display name and runs a silent uninstall. If the app was never installed via
/// MSI (bare-EXE dev mode) the script exits without error — no harm done.
///
/// On Linux: writes a bash script that removes the DEB package via dpkg/apt,
/// or falls back to removing the binary directly if it was never packaged.
/// The script runs detached so it survives the process exit.
pub fn trigger_uninstall_and_exit(reason: &str) -> ! {
    #[cfg(target_os = "windows")]
    trigger_uninstall_windows(reason);

    #[cfg(target_os = "linux")]
    trigger_uninstall_linux(reason);

    // Fallback for other platforms (macOS, etc.) — just exit cleanly.
    #[cfg(not(any(target_os = "windows", target_os = "linux")))]
    {
        tracing::warn!("License expired ({}). Self-uninstall not supported on this platform — exiting.", reason);
        std::process::exit(0)
    }
}

#[cfg(target_os = "windows")]
fn trigger_uninstall_windows(reason: &str) -> ! {
    tracing::warn!("License expired ({}). Triggering Windows self-uninstall.", reason);

    const SCRIPT: &str = r#"
$ErrorActionPreference = 'SilentlyContinue'
$appName = 'Student AI'
$regPaths = @(
  'HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*',
  'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
)
$found = $false
foreach ($path in $regPaths) {
  $entry = Get-ItemProperty $path -ErrorAction SilentlyContinue |
             Where-Object { $_.DisplayName -eq $appName }
  if ($entry) {
    $uninstStr = $entry.UninstallString
    # Detect NSIS uninstaller: UninstallString is a path to unins*.exe
    if ($uninstStr -match 'unins\d+\.exe' -or ($uninstStr -notmatch '^\s*MsiExec' -and $uninstStr -match '\.exe')) {
      $exePath = $uninstStr -replace '"', '' -replace ' /.*$', ''
      Write-Host "NSIS uninstall: $exePath"
      if (Test-Path $exePath) {
        Start-Process $exePath -ArgumentList '/S' -Wait -ErrorAction SilentlyContinue
      }
    } else {
      # MSI fallback: extract GUID and call msiexec
      $guid = Split-Path $entry.PSPath -Leaf
      if ($guid -match '^\{[0-9A-Fa-f\-]+\}$') {
        Write-Host "MSI uninstall: $guid"
        Start-Process msiexec.exe -ArgumentList "/x $guid /quiet /norestart" -Wait -ErrorAction SilentlyContinue
      }
    }
    $found = $true
    break
  }
}
if (-not $found) {
  # Last resort: find and run any unins*.exe in the Student AI install dir
  $installDir = "$env:LOCALAPPDATA\Student AI"
  if (Test-Path $installDir) {
    $unins = Get-ChildItem $installDir -Filter 'unins*.exe' -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($unins) { Start-Process $unins.FullName -ArgumentList '/S' -Wait -ErrorAction SilentlyContinue }
  }
}
Remove-Item -Path $MyInvocation.MyCommand.Path -Force -ErrorAction SilentlyContinue
"#;

    let script_path = std::env::temp_dir().join("studentai_uninstall.ps1");
    if std::fs::write(&script_path, SCRIPT).is_ok() {
        let _ = std::process::Command::new("powershell.exe")
            .args([
                "-ExecutionPolicy", "Bypass",
                "-NonInteractive",
                "-WindowStyle", "Hidden",
                "-File", script_path.to_str().unwrap_or(""),
            ])
            .spawn();
    } else {
        tracing::error!("Failed to write Windows uninstall script to temp dir.");
    }

    std::process::exit(0)
}

#[cfg(target_os = "linux")]
fn trigger_uninstall_linux(reason: &str) -> ! {
    tracing::warn!("License expired ({}). Triggering Linux self-uninstall.", reason);

    // dpkg package name = productName lowercased with spaces replaced by hyphens.
    // "Student AI" → "student-ai"  (matches what Tauri writes to the DEB control file).
    const SCRIPT: &str = r#"#!/usr/bin/env bash
set -euo pipefail
APP_NAME="student-ai"
APP_DATA="${XDG_DATA_HOME:-$HOME/.local/share}/com.studentai.app"

if dpkg-query -W "$APP_NAME" > /dev/null 2>&1; then
    # Installed as a DEB package — remove via package manager.
    pkexec apt-get remove -y "$APP_NAME" 2>/dev/null \
      || sudo dpkg -r "$APP_NAME" 2>/dev/null \
      || dpkg -r "$APP_NAME" 2>/dev/null \
      || true
else
    # Not in dpkg — bare binary install; remove the executable directly.
    EXE_PATH="$(cat /tmp/studentai_exe_path.txt 2>/dev/null || true)"
    if [[ -n "$EXE_PATH" && -f "$EXE_PATH" ]]; then
        rm -f "$EXE_PATH"
    fi
fi

# Remove user data (chats, index, uploaded docs).  Models are intentionally kept.
if [[ -d "$APP_DATA" ]]; then
    find "$APP_DATA" -maxdepth 1 \
      \( -name "student_ai.db" -o -name "rag_index.bin" -o -name "uploaded_docs" -o -name "license.json" \) \
      -exec rm -rf {} + 2>/dev/null || true
fi

rm -f "$0"
"#;

    // Record the exe path so the script can find it even after process exit.
    let exe = std::env::current_exe()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();
    let _ = std::fs::write("/tmp/studentai_exe_path.txt", &exe);

    let script_path = std::env::temp_dir().join("studentai_uninstall.sh");
    if std::fs::write(&script_path, SCRIPT).is_ok() {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(
            &script_path,
            std::fs::Permissions::from_mode(0o755),
        );
        // Spawn detached — the child outlives the parent (adopted by init/PID 1).
        let _ = std::process::Command::new("bash")
            .arg(script_path.to_str().unwrap_or(""))
            .spawn();
    } else {
        tracing::error!("Failed to write Linux uninstall script to temp dir.");
    }

    std::process::exit(0)
}
