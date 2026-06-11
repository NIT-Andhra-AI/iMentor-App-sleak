/// Open a URL in the system default browser.
///
/// Uses the platform shell so no browser-detection logic is needed.
/// Only `https://` and `http://` URLs are accepted; others are rejected
/// to prevent arbitrary command execution.
#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err("Only http/https URLs are permitted".into());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| format!("Failed to open URL: {e}"))?;
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {e}"))?;
    }

    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| format!("Failed to open URL: {e}"))?;
    }

    Ok(())
}

/// Install missing Windows prerequisites (currently VC++ runtime) and return
/// whether the runtime check passes afterwards.
#[tauri::command]
pub fn install_windows_prerequisites() -> Result<bool, String> {
    #[cfg(target_os = "windows")]
    {
        if crate::commands::settings::vcredist_ok() {
            return Ok(true);
        }

        let vc_url = if cfg!(target_arch = "aarch64") {
            "https://aka.ms/vs/17/release/vc_redist.arm64.exe"
        } else {
            "https://aka.ms/vs/17/release/vc_redist.x64.exe"
        };

        let script = format!(
            "$ErrorActionPreference='Stop'; \
             [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; \
             $tmp = Join-Path $env:TEMP 'studentai-vc-redist.exe'; \
             Invoke-WebRequest -Uri '{vc_url}' -OutFile $tmp; \
             Start-Process -FilePath $tmp -ArgumentList '/install /quiet /norestart' -Verb RunAs -Wait; \
             Remove-Item $tmp -Force -ErrorAction SilentlyContinue"
        );

        let status = std::process::Command::new("powershell")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &script])
            .status()
            .map_err(|e| format!("Failed to start prerequisite installer: {e}"))?;

        if !status.success() {
            return Err(format!(
                "Prerequisite installer exited with status {status}"
            ));
        }

        return Ok(crate::commands::settings::vcredist_ok());
    }

    #[cfg(not(target_os = "windows"))]
    {
        Ok(true)
    }
}
