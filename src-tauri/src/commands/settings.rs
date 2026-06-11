use serde::Serialize;
use tauri::State;

use crate::state::AppState;

#[derive(Debug, Serialize)]
pub struct SystemStats {
    pub available_ram_mb: u64,
    pub total_ram_mb: u64,
    pub cpu_threads: usize,
    pub app_ram_mb: u64,
    pub app_cpu_pct: f32,
}

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct ModelStatus {
    /// `true` if the LLM is currently loaded in memory and ready to infer.
    pub llm_loaded: bool,
    /// `true` if the LLM GGUF file exists on disk (may not be loaded yet).
    pub llm_exists: bool,
    /// `true` if the embedding GGUF file exists on disk.
    pub embedding_exists: bool,
    /// Approximate available system RAM in mebibytes.
    pub available_ram_mb: u64,
    /// `false` on Windows when vcruntime140.dll / msvcp140.dll are absent.
    /// Always `true` on non-Windows platforms.
    pub vcredist_ok: bool,
    /// `true` when the binary was compiled with the `vulkan` feature (GPU offload).
    pub gpu_enabled: bool,
}

// ── Prerequisite helpers ──────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
pub(crate) fn vcredist_ok() -> bool {
    let sys = std::env::var("SystemRoot")
        .map(|r| std::path::PathBuf::from(r).join("System32"))
        .unwrap_or_else(|_| std::path::PathBuf::from(r"C:\Windows\System32"));
    sys.join("vcruntime140.dll").is_file() && sys.join("msvcp140.dll").is_file()
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn vcredist_ok() -> bool {
    true
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Retrieve a single setting value by key.
/// Returns `None` if the key has never been set.
#[tauri::command]
pub async fn get_setting(
    key: String,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let store = state.session_store.lock().await;
    store.get_setting(&key).map_err(|e| e.to_string())
}

/// Persist a key/value setting to SQLite.
#[tauri::command]
pub async fn set_setting(
    key: String,
    value: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let store = state.session_store.lock().await;
    store.set_setting(&key, &value).map_err(|e| e.to_string())
}

/// Return the current model-readiness status so the frontend can show
/// download prompts or a "model loading" spinner as appropriate.
#[tauri::command]
pub async fn get_model_status(state: State<'_, AppState>) -> Result<ModelStatus, String> {
    let llm_guard = state.llm.lock().await;
    Ok(ModelStatus {
        llm_loaded: llm_guard.is_some(),
        llm_exists: state.model_manager.llm_exists(),
        embedding_exists: state.model_manager.embedding_exists(),
        available_ram_mb: inference::ModelManager::available_ram_mb(),
        vcredist_ok: vcredist_ok(),
        gpu_enabled: cfg!(feature = "vulkan"),
    })
}

/// Return live system stats: RAM usage, CPU thread count, and per-process stats.
/// Called frequently from the Settings panel (every 2 s) — must be fast.
#[tauri::command]
pub async fn get_system_stats() -> Result<SystemStats, String> {
    let (available_ram_mb, total_ram_mb) = inference::ModelManager::ram_snapshot_mb();
    let cpu_threads = std::thread::available_parallelism()
        .map(|n| n.get())
        .unwrap_or(1);
    let (app_ram_mb, app_cpu_pct) = inference::ModelManager::app_process_stats();
    Ok(SystemStats { available_ram_mb, total_ram_mb, cpu_threads, app_ram_mb, app_cpu_pct })
}
