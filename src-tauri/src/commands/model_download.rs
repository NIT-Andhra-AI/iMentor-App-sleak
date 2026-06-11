use futures_util::StreamExt;
use tauri::{ipc::Channel, State};
use tokio::io::AsyncWriteExt;

use crate::state::AppState;

/// Progress event streamed to the frontend during a model download.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DownloadProgress {
    /// `"llm"` or `"embedding"`.
    pub model_type: String,
    /// Bytes received so far.
    pub bytes_done: u64,
    /// Total file size in bytes (0 if the server did not send Content-Length).
    pub total_bytes: u64,
    /// Download percentage (0–100), or 0 when total is unknown.
    pub percent: f32,
    /// `true` on the final event (success or failure).
    pub done: bool,
    /// Set on the final event only if the download failed.
    pub error: Option<String>,
}

/// Model download URL resolved from models.toml at build time.
/// To change the model: edit models.toml and rebuild — no code change needed.
fn model_url(model_type: &str) -> Option<&'static str> {
    match model_type {
        "llm"       => Some(crate::build_config::LLM_URL),
        "embedding" => Some(crate::build_config::EMBED_URL),
        _ => None,
    }
}

/// Download a GGUF model file and stream byte-level progress to the frontend.
///
/// On the final event `done == true`.  If an error occurred, `error` is set
/// and the partially-written file is deleted so a retry starts clean.
///
/// After a successful LLM download the engine is loaded immediately so the
/// user can start chatting without restarting the app.
#[tauri::command]
pub async fn download_model(
    model_type: String,
    channel: Channel<DownloadProgress>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // ── 1. Resolve URL and destination path ──────────────────────────────────
    let url = model_url(&model_type)
        .ok_or_else(|| format!("Unknown model type: {model_type}"))?;

    let dest_path = match model_type.as_str() {
        "llm" => state.model_manager.llm_model_path(),
        "embedding" => state.model_manager.embedding_model_path(),
        _ => return Err(format!("Unknown model type: {model_type}")),
    };

    // ── 1a. Skip download if already present. ────────────────────────────
    if dest_path.is_file() {
        channel
            .send(DownloadProgress {
                model_type: model_type.clone(),
                bytes_done: 0,
                total_bytes: 0,
                percent: 100.0,
                done: true,
                error: None,
            })
            .ok();
        return Ok(());
    }

    // Ensure parent directory exists.
    if let Some(parent) = dest_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|_| "Cannot create models directory. Check disk permissions.".to_string())?;
    }

    // ── 1b. Check for local sidecar file next to the exe (llm.gguf). ────────
    // This covers the offline-installer scenario where the user places
    // llm.gguf alongside the setup.exe / installed exe, or the NSIS hook
    // was skipped. Copy it directly — no network needed.
    if model_type == "llm" {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()));
        if let Some(dir) = exe_dir {
            let sidecar = dir.join("llm.gguf");
            if sidecar.is_file() {
                tracing::info!(src = %sidecar.display(), dest = %dest_path.display(),
                    "Copying local llm.gguf sidecar — skipping network download");
                // Emit a progress event so the UI shows activity.
                channel.send(DownloadProgress {
                    model_type: model_type.clone(),
                    bytes_done: 0,
                    total_bytes: sidecar.metadata().map(|m| m.len()).unwrap_or(0),
                    percent: 0.0,
                    done: false,
                    error: None,
                }).ok();
                if let Err(e) = tokio::fs::copy(&sidecar, &dest_path).await {
                    tracing::warn!("Failed to copy local llm.gguf: {e}");
                } else {
                    let size = dest_path.metadata().map(|m| m.len()).unwrap_or(0);
                    channel.send(DownloadProgress {
                        model_type: model_type.clone(),
                        bytes_done: size,
                        total_bytes: size,
                        percent: 100.0,
                        done: true,
                        error: None,
                    }).ok();
                    // Load the LLM immediately (generate_stream will adapt n_ctx dynamically).
                    let configured_n_ctx = crate::build_config::n_ctx();
                    if let Ok(engine) = inference::LlmEngine::load(&dest_path, 0, configured_n_ctx) {
                        let mut guard = state.llm.lock().await;
                        *guard = Some(engine);
                        tracing::info!("LLM loaded from local sidecar");
                    }
                    return Ok(());
                }
            }
        }
    }

    let emit_error = |msg: String| {
        channel
            .send(DownloadProgress {
                model_type: model_type.clone(),
                bytes_done: 0,
                total_bytes: 0,
                percent: 0.0,
                done: true,
                error: Some(msg.clone()),
            })
            .ok();
        msg
    };

    // ── 2. Send HTTP GET with streaming body ─────────────────────────────────
    let client = reqwest::Client::builder()
        .user_agent("StudentAI/0.1")
        .build()
        .map_err(|_| emit_error(
            "Could not start the download. Please check your internet connection and retry."
                .to_string(),
        ))?;

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|_| emit_error(
            "No internet connection. Connect to the internet and retry, \
             or use the Student AI Offline Installer for a complete offline setup."
                .to_string(),
        ))?;

    if !response.status().is_success() {
        return Err(emit_error(
            "Could not reach the model server. Connect to the internet and retry, \
             or use the Student AI Offline Installer."
                .to_string(),
        ));
    }

    let total_bytes = response.content_length().unwrap_or(0);

    // ── 3. Stream to disk, emitting progress every 512 KB ───────────────────
    let tmp_path = dest_path.with_extension("gguf.part");
    let mut file = tokio::fs::File::create(&tmp_path)
        .await
        .map_err(|e| emit_error(format!("Cannot create temp file: {e}")))?;

    let mut stream = response.bytes_stream();
    let mut bytes_done: u64 = 0;
    let mut last_emit: u64 = 0;
    const EMIT_EVERY: u64 = 512 * 1024; // 512 KB

    while let Some(chunk_result) = stream.next().await {
        let chunk = match chunk_result {
            Ok(c) => c,
            Err(_) => {
                let _ = tokio::fs::remove_file(&tmp_path).await;
                return Err(emit_error(
                    "Download interrupted. Check your internet connection and retry."
                        .to_string(),
                ));
            }
        };

        if let Err(_) = file.write_all(&chunk).await {
            let _ = tokio::fs::remove_file(&tmp_path).await;
            return Err(emit_error(
                "Failed to save the AI model to disk. Please ensure you have enough free space."
                    .to_string(),
            ));
        }

        bytes_done += chunk.len() as u64;

        // Throttle progress events to avoid flooding the frontend.
        if bytes_done - last_emit >= EMIT_EVERY || bytes_done == total_bytes {
            let percent = if total_bytes > 0 {
                (bytes_done as f32 / total_bytes as f32) * 100.0
            } else {
                0.0
            };
            channel
                .send(DownloadProgress {
                    model_type: model_type.clone(),
                    bytes_done,
                    total_bytes,
                    percent,
                    done: false,
                    error: None,
                })
                .ok();
            last_emit = bytes_done;
        }
    }

    // Flush and rename temp file to final destination.
    file.flush()
        .await
        .map_err(|_| emit_error("Failed to save the AI model. Please ensure you have enough free disk space.".to_string()))?;
    drop(file);
    tokio::fs::rename(&tmp_path, &dest_path)
        .await
        .map_err(|_| emit_error("Failed to finalise the AI model file. Please ensure you have enough free disk space.".to_string()))?;

    tracing::info!(
        model = %model_type,
        path  = %dest_path.display(),
        bytes = bytes_done,
        "Model download complete"
    );

    // ── 4. Immediately load the LLM (generate_stream adapts n_ctx per-inference) ───
    if model_type == "llm" {
        let configured_n_ctx = crate::build_config::n_ctx();
        match inference::LlmEngine::load(&dest_path, 0, configured_n_ctx) {
            Ok(engine) => {
                let mut llm_guard = state.llm.lock().await;
                *llm_guard = Some(engine);
                tracing::info!("LLM loaded after download");
            }
            Err(e) => {
                tracing::warn!("Downloaded LLM but failed to load it: {e}");
            }
        }
    }

    // ── 5. Final done event ───────────────────────────────────────────────────
    channel
        .send(DownloadProgress {
            model_type,
            bytes_done,
            total_bytes,
            percent: 100.0,
            done: true,
            error: None,
        })
        .ok();

    Ok(())
}
