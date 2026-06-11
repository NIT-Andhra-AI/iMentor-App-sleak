use serde::Serialize;
use crate::license::LicenseStatus;
use crate::state::AppState;

/// Deployment status returned to the frontend on startup.
#[derive(Debug, Serialize)]
pub struct DeploymentStatus {
    /// Whether an expiry date is configured.
    pub has_expiry: bool,
    /// ISO 8601 expiry date, or empty string.
    pub expiry_date: String,
    /// Days remaining until expiry (negative = already expired).
    /// `None` when no expiry is configured.
    pub days_remaining: Option<i64>,
    /// Whether the deployment has passed its expiry date.
    pub is_expired: bool,
    /// Warning message to show the user (from build_config.toml).
    pub warning_message: String,
    /// Whether self-delete is enabled in this build.
    pub self_delete_enabled: bool,
    /// Days after expiry before data is wiped (grace period).
    pub grace_days: i64,
}

/// Called by the frontend on startup to check deployment expiry.
/// The UI uses this to show a banner or block access if expired.
#[tauri::command]
pub fn deployment_status() -> DeploymentStatus {
    use crate::build_config;

    DeploymentStatus {
        has_expiry: !build_config::EXPIRY_DATE.is_empty(),
        expiry_date: build_config::EXPIRY_DATE.to_string(),
        days_remaining: build_config::days_until_expiry(),
        is_expired: build_config::is_expired(),
        warning_message: build_config::EXPIRY_WARNING.to_string(),
        self_delete_enabled: build_config::SELF_DELETE_ON_EXPIRY,
        grace_days: build_config::self_delete_grace_days(),
    }
}

/// Returns the current activity-based license status.
/// Called by SettingsPanel and on app startup to show warnings / trigger uninstall.
#[tauri::command]
pub async fn get_license_status(
    state: tauri::State<'_, AppState>,
) -> Result<LicenseStatus, String> {
    let lm = state.license_manager.lock().await;
    Ok(lm.status())
}
