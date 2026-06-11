use serde::Serialize;
use tauri::State;

use crate::state::AppState;

const EULA_VERSION: &str = "1.0";

#[derive(Debug, Serialize)]
pub struct ConsentStatus {
    /// `true` if the user has accepted the EULA.
    pub consent_given: bool,
    /// Version of the EULA the user accepted, e.g. "1.0".
    pub consent_version: Option<String>,
    /// `false` if user has opted out of telemetry after consent.
    pub telemetry_enabled: bool,
    /// Number of sessions sitting in the local queue waiting to be sent.
    pub pending_sessions: usize,
}

/// Return the current consent and telemetry opt-in status.
#[tauri::command]
pub async fn get_consent_status(state: State<'_, AppState>) -> Result<ConsentStatus, String> {
    let store = state.session_store.lock().await;
    let consent_given = store
        .get_setting("consent_given")
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false);

    let consent_version = store.get_setting("consent_version").ok().flatten();

    let telemetry_enabled = store
        .get_setting("telemetry_enabled")
        .ok()
        .flatten()
        .map(|v| v != "false")
        .unwrap_or(true);

    drop(store);
    let pending_sessions = state.telemetry_queue.pending_count().await;

    Ok(ConsentStatus {
        consent_given,
        consent_version,
        telemetry_enabled,
        pending_sessions,
    })
}

/// Record that the user has accepted the EULA.
/// Enables telemetry and unlocks the background flush task.
#[tauri::command]
pub async fn accept_consent(state: State<'_, AppState>) -> Result<(), String> {
    let store = state.session_store.lock().await;
    store
        .set_setting("consent_given", "true")
        .map_err(|e| e.to_string())?;
    store
        .set_setting("consent_version", EULA_VERSION)
        .map_err(|e| e.to_string())?;
    store
        .set_setting("telemetry_enabled", "true")
        .map_err(|e| e.to_string())?;
    drop(store);

    // Rebuild the sender with enabled=true so the next flush actually sends.
    state.telemetry.set_enabled(true);

    Ok(())
}

/// Record that the user has declined the EULA (or revoked consent later).
/// Disables telemetry and clears the local queue.
#[tauri::command]
pub async fn decline_consent(state: State<'_, AppState>) -> Result<(), String> {
    let store = state.session_store.lock().await;
    store
        .set_setting("consent_given", "false")
        .map_err(|e| e.to_string())?;
    store
        .set_setting("telemetry_enabled", "false")
        .map_err(|e| e.to_string())?;
    drop(store);

    // Disable the sender and wipe the queue so nothing can be sent.
    state.telemetry.set_enabled(false);
    state.telemetry_queue.clear().await;

    Ok(())
}

/// Toggle the telemetry opt-in at runtime (Settings panel).
/// Consent must already have been given; this just controls the opt-in flag.
#[tauri::command]
pub async fn set_telemetry_enabled(
    enabled: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let store = state.session_store.lock().await;
    store
        .set_setting("telemetry_enabled", if enabled { "true" } else { "false" })
        .map_err(|e| e.to_string())?;
    drop(store);

    state.telemetry.set_enabled(enabled);

    if !enabled {
        // Wipe queued sessions immediately when user opts out.
        state.telemetry_queue.clear().await;
    }

    Ok(())
}
