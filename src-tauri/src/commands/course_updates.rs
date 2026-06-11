use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel, State};
use tokio::io::AsyncWriteExt;

use crate::state::AppState;
use crate::commands::courses::resolve_course_dir;

// ── Server catalog types ──────────────────────────────────────────────────────

/// Mirror of the server's `CourseCatalogEntry` response model.
#[derive(Debug, Deserialize)]
struct ServerCourse {
    id: String,
    title: String,
    description: String,
    version: String,
    wiki_page_count: Option<u64>,
    size_bytes: Option<u64>,
}

// ── Public response types ─────────────────────────────────────────────────────

/// Per-course update status returned to the frontend.
#[derive(Debug, Serialize)]
pub struct CourseUpdateInfo {
    pub id: String,
    pub title: String,
    pub description: String,
    /// Version available on the server.
    pub server_version: String,
    /// Version currently installed locally (`null` = not installed).
    pub local_version: Option<String>,
    pub wiki_page_count: u64,
    /// Bundle size in bytes as reported by the server (`null` = unknown).
    pub size_bytes: Option<u64>,
    /// `"new"` = not installed, `"update"` = installed but older, `"current"` = up to date.
    pub status: String,
}

/// Progress event streamed to the frontend during a course download + extraction.
#[derive(Debug, Clone, Serialize)]
pub struct CourseDownloadProgress {
    pub course_id: String,
    pub bytes_done: u64,
    pub total_bytes: u64,
    pub percent: f32,
    /// Current operation: `"downloading"`, `"extracting"`, `"done"`.
    pub phase: String,
    pub done: bool,
    pub error: Option<String>,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Fetch the server course catalog and diff against locally installed courses.
///
/// Returns a list of every course the server knows about, annotated with
/// whether it is new, has an available update, or is already current.
/// Requires internet connectivity; returns an error if the server is unreachable.
#[tauri::command]
pub async fn check_course_updates(
    state: State<'_, AppState>,
) -> Result<Vec<CourseUpdateInfo>, String> {
    // Resolve the best reachable endpoint (LAN on campus, public off-campus).
    let base_url = state
        .endpoint_resolver
        .resolve()
        .await
        .ok_or_else(|| "Server unreachable — check your internet connection".to_string())?;

    let catalog_url = format!("{}/v1/courses", base_url);

    let client = reqwest::Client::builder()
        .user_agent("StudentAI/0.1")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| format!("HTTP client error: {e}"))?;

    let response = client
        .get(&catalog_url)
        .send()
        .await
        .map_err(|e| format!("Could not reach server: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Server returned {} for {}",
            response.status(),
            catalog_url
        ));
    }

    let server_courses: Vec<ServerCourse> = response
        .json()
        .await
        .map_err(|e| format!("Invalid catalog response: {e}"))?;

    // Compare each server course against what's locally installed.
    let mut result = Vec::with_capacity(server_courses.len());
    for sc in server_courses {
        let local_version = resolve_course_dir(&sc.id, &state.assets_dir, &state.app_data_dir)
            .and_then(|dir| {
                let manifest = std::fs::read_to_string(dir.join("manifest.json")).ok()?;
                let v: serde_json::Value = serde_json::from_str(&manifest).ok()?;
                v["version"].as_str().map(str::to_string)
            });

        let status = match &local_version {
            None => "new".to_string(),
            Some(lv) if lv != &sc.version => "update".to_string(),
            _ => "current".to_string(),
        };

        result.push(CourseUpdateInfo {
            id: sc.id,
            title: sc.title,
            description: sc.description,
            server_version: sc.version,
            local_version,
            wiki_page_count: sc.wiki_page_count.unwrap_or(0),
            size_bytes: sc.size_bytes,
            status,
        });
    }

    Ok(result)
}

/// Download a course bundle from the server, extract it, and stream progress.
///
/// The bundle ZIP is extracted to `app_data_dir/courses/{course_id}/`.
/// Any previous version in that directory is replaced atomically.
/// Progress events are sent on `channel` through three phases:
///   1. `"downloading"` — byte-level download progress
///   2. `"extracting"` — extraction started (single event)
///   3. `"done"` — finished successfully (or `error` is set on failure)
#[tauri::command]
pub async fn download_course(
    course_id: String,
    channel: Channel<CourseDownloadProgress>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // ── 1. Resolve server URL ─────────────────────────────────────────────────
    let base_url = state
        .endpoint_resolver
        .resolve()
        .await
        .ok_or_else(|| "Server unreachable — check your internet connection".to_string())?;

    let bundle_url = format!("{}/v1/courses/{}/bundle", base_url, course_id);

    let emit_error = {
        let channel = channel.clone();
        let course_id = course_id.clone();
        move |msg: String| -> String {
            channel
                .send(CourseDownloadProgress {
                    course_id: course_id.clone(),
                    bytes_done: 0,
                    total_bytes: 0,
                    percent: 0.0,
                    phase: "done".to_string(),
                    done: true,
                    error: Some(msg.clone()),
                })
                .ok();
            msg
        }
    };

    // ── 2. HTTP GET with streaming body ───────────────────────────────────────
    let client = reqwest::Client::builder()
        .user_agent("StudentAI/0.1")
        .build()
        .map_err(|e| emit_error(format!("HTTP client error: {e}")))?;

    let response = client
        .get(&bundle_url)
        .send()
        .await
        .map_err(|e| emit_error(format!("Download request failed: {e}")))?;

    if !response.status().is_success() {
        let code = response.status();
        return Err(emit_error(format!(
            "Server returned {code} for course '{course_id}'"
        )));
    }

    let total_bytes = response.content_length().unwrap_or(0);

    // ── 3. Stream ZIP to a temp file, emitting progress every 256 KB ─────────
    let courses_data_dir = state.app_data_dir.join("courses");
    tokio::fs::create_dir_all(&courses_data_dir)
        .await
        .map_err(|e| emit_error(format!("Cannot create courses directory: {e}")))?;

    let tmp_path = courses_data_dir.join(format!("{}.zip.part", course_id));
    let mut file = tokio::fs::File::create(&tmp_path)
        .await
        .map_err(|e| emit_error(format!("Cannot create temp file: {e}")))?;

    let mut stream = response.bytes_stream();
    let mut bytes_done: u64 = 0;
    let mut last_emit: u64 = 0;
    const EMIT_EVERY: u64 = 256 * 1024; // 256 KB

    while let Some(chunk_result) = stream.next().await {
        let chunk = match chunk_result {
            Ok(c) => c,
            Err(e) => {
                let _ = tokio::fs::remove_file(&tmp_path).await;
                return Err(emit_error(format!("Download interrupted: {e}")));
            }
        };

        if let Err(e) = file.write_all(&chunk).await {
            let _ = tokio::fs::remove_file(&tmp_path).await;
            return Err(emit_error(format!("Disk write failed: {e}")));
        }

        bytes_done += chunk.len() as u64;

        if bytes_done - last_emit >= EMIT_EVERY || (total_bytes > 0 && bytes_done >= total_bytes) {
            let percent = if total_bytes > 0 {
                (bytes_done as f32 / total_bytes as f32) * 100.0
            } else {
                0.0
            };
            channel
                .send(CourseDownloadProgress {
                    course_id: course_id.clone(),
                    bytes_done,
                    total_bytes,
                    percent,
                    phase: "downloading".to_string(),
                    done: false,
                    error: None,
                })
                .ok();
            last_emit = bytes_done;
        }
    }

    file.flush()
        .await
        .map_err(|e| emit_error(format!("File flush failed: {e}")))?;
    drop(file);

    // ── 4. Extract ZIP → app_data_dir/courses/{course_id}/ ───────────────────
    channel
        .send(CourseDownloadProgress {
            course_id: course_id.clone(),
            bytes_done,
            total_bytes,
            percent: 100.0,
            phase: "extracting".to_string(),
            done: false,
            error: None,
        })
        .ok();

    let dest_dir = courses_data_dir.join(&course_id);
    let tmp_path_clone = tmp_path.clone();
    let dest_dir_clone = dest_dir.clone();

    let extract_result = tokio::task::spawn_blocking(move || {
        let file = std::fs::File::open(&tmp_path_clone)
            .map_err(|e| format!("Cannot open ZIP: {e}"))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("Invalid ZIP archive: {e}"))?;

        // Write to a staging directory, then rename atomically.
        let staging = dest_dir_clone.with_extension("_staging");
        if staging.exists() {
            std::fs::remove_dir_all(&staging)
                .map_err(|e| format!("Cannot clear staging dir: {e}"))?;
        }
        std::fs::create_dir_all(&staging)
            .map_err(|e| format!("Cannot create staging dir: {e}"))?;

        for i in 0..archive.len() {
            let mut entry = archive.by_index(i)
                .map_err(|e| format!("ZIP entry error: {e}"))?;

            // Sanitize path — strip leading components so the course contents
            // land directly under staging/ without a wrapping directory.
            let raw = entry.name().replace('\\', "/");
            let parts: Vec<&str> = raw.splitn(2, '/').collect();
            let relative = if parts.len() == 2 { parts[1] } else { parts[0] };
            if relative.is_empty() {
                continue;
            }

            // Security: reject any path traversal attempts.
            if relative.contains("..") {
                continue;
            }

            let out_path = staging.join(relative);

            if entry.is_dir() {
                std::fs::create_dir_all(&out_path)
                    .map_err(|e| format!("Cannot create dir {}: {e}", out_path.display()))?;
            } else {
                if let Some(parent) = out_path.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("Cannot create parent dir: {e}"))?;
                }
                let mut out_file = std::fs::File::create(&out_path)
                    .map_err(|e| format!("Cannot create {}: {e}", out_path.display()))?;
                std::io::copy(&mut entry, &mut out_file)
                    .map_err(|e| format!("Write failed for {}: {e}", out_path.display()))?;
            }
        }

        // Atomically replace old version.
        if dest_dir_clone.exists() {
            std::fs::remove_dir_all(&dest_dir_clone)
                .map_err(|e| format!("Cannot remove old course: {e}"))?;
        }
        std::fs::rename(&staging, &dest_dir_clone)
            .map_err(|e| format!("Cannot rename staging dir: {e}"))?;

        Ok::<(), String>(())
    })
    .await
    .map_err(|e| emit_error(format!("Extraction task panicked: {e}")))?;

    // Clean up temp file regardless of outcome.
    let _ = tokio::fs::remove_file(&tmp_path).await;

    if let Err(e) = extract_result {
        return Err(emit_error(e));
    }

    tracing::info!(
        course_id = %course_id,
        dest = %dest_dir.display(),
        bytes = bytes_done,
        "Course download + extraction complete"
    );

    // ── 5. Final done event ───────────────────────────────────────────────────
    channel
        .send(CourseDownloadProgress {
            course_id,
            bytes_done,
            total_bytes,
            percent: 100.0,
            phase: "done".to_string(),
            done: true,
            error: None,
        })
        .ok();

    Ok(())
}
