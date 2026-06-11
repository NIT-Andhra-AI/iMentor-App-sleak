use std::collections::HashSet;

use sha2::{Digest, Sha256};
use serde::Serialize;
use tauri::State;

use crate::state::AppState;

// ── Response types ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize)]
pub struct CourseInfo {
    pub id: String,
    pub title: String,
    pub description: String,
    pub wiki_page_count: usize,
    pub version: String,
    /// `true` = installed from a server download (lives in app_data_dir/courses/).
    /// `false` = bundled with the app (lives in assets_dir/courses/).
    pub is_downloaded: bool,
    /// `true` = user has removed this course.
    /// For downloaded courses the directory has been deleted from disk.
    /// For bundled-only courses the id is recorded in the `removed_bundled_courses` setting.
    pub removed: bool,
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/// Read all courses from a single directory, skipping malformed entries.
fn read_courses_from_dir(courses_dir: &std::path::Path, is_downloaded: bool) -> Vec<CourseInfo> {
    let entries = match std::fs::read_dir(courses_dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };

    let mut out = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let manifest_path = path.join("manifest.json");
        let content = match std::fs::read_to_string(&manifest_path) {
            Ok(c) => c,
            Err(_) => continue,
        };
        let manifest: serde_json::Value = match serde_json::from_str(&content) {
            Ok(v) => v,
            Err(_) => continue,
        };

        let id = manifest["id"].as_str().unwrap_or("").to_string();
        if id.is_empty() {
            continue;
        }

        out.push(CourseInfo {
            id,
            title: manifest["title"].as_str().unwrap_or("").to_string(),
            description: manifest["description"].as_str().unwrap_or("").to_string(),
            wiki_page_count: manifest["wiki_page_count"].as_u64().unwrap_or(0) as usize,
            version: manifest["version"].as_str().unwrap_or("1.0.0").to_string(),
            is_downloaded,
            removed: false, // filled in by list_courses
        });
    }
    out
}

/// Merge bundled + downloaded courses.
/// Downloaded courses shadow bundled ones with the same id (downloaded wins).
fn merge_courses(bundled: Vec<CourseInfo>, downloaded: Vec<CourseInfo>) -> Vec<CourseInfo> {
    let mut map: std::collections::HashMap<String, CourseInfo> = bundled
        .into_iter()
        .map(|c| (c.id.clone(), c))
        .collect();

    for course in downloaded {
        map.insert(course.id.clone(), course);
    }

    let mut courses: Vec<CourseInfo> = map.into_values().collect();
    courses.sort_by(|a, b| a.title.cmp(&b.title));
    courses
}

/// Resolve the directory path for a given course id,
/// preferring the user-downloaded location over the bundled one.
pub fn resolve_course_dir(
    course_id: &str,
    assets_dir: &std::path::Path,
    app_data_dir: &std::path::Path,
) -> Option<std::path::PathBuf> {
    let downloaded = app_data_dir.join("courses").join(course_id);
    if downloaded.join("manifest.json").exists() {
        return Some(downloaded);
    }
    let bundled = assets_dir.join("courses").join(course_id);
    if bundled.join("manifest.json").exists() {
        return Some(bundled);
    }
    None
}

fn candidate_course_dirs(
    course_id: &str,
    assets_dir: &std::path::Path,
    app_data_dir: &std::path::Path,
) -> Vec<std::path::PathBuf> {
    let mut dirs = Vec::new();
    let downloaded = app_data_dir.join("courses").join(course_id);
    if downloaded.join("manifest.json").exists() {
        dirs.push(downloaded);
    }
    let bundled = assets_dir.join("courses").join(course_id);
    if bundled.join("manifest.json").exists() {
        dirs.push(bundled);
    }
    dirs
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Enumerate all course bundles from both the bundled assets directory
/// and the user's downloaded courses directory.
///
/// Downloaded courses take precedence over bundled ones with the same id.
/// Courses the user has removed carry `removed = true`; the frontend normal
/// view filters them out while the manage view can offer a restore action.
#[tauri::command]
pub async fn list_courses(state: State<'_, AppState>) -> Result<Vec<CourseInfo>, String> {
    let bundled = read_courses_from_dir(&state.assets_dir.join("courses"), false);
    let downloaded = read_courses_from_dir(&state.app_data_dir.join("courses"), true);
    let mut courses = merge_courses(bundled, downloaded);

    let removed = {
        let store = state.session_store.lock().await;
        get_removed_set(&store)
    };
    for course in &mut courses {
        course.removed = removed.contains(&course.id);
    }

    Ok(courses)
}

/// Return the markdown content of a single wiki page.
#[tauri::command]
pub async fn get_wiki_page(
    course_id: String,
    page_slug: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    let dirs = candidate_course_dirs(&course_id, &state.assets_dir, &state.app_data_dir);
    if dirs.is_empty() {
        return Err(format!("Course '{}' not found", course_id));
    }

    let mut attempted = Vec::new();
    for course_dir in dirs {
        let page_path = course_dir.join("wiki").join(format!("{}.md", page_slug));
        attempted.push(page_path.display().to_string());
        if page_path.exists() {
            return std::fs::read_to_string(&page_path)
                .map_err(|e| format!("Could not read page '{}': {}", page_slug, e));
        }
    }

    Err(format!(
        "Page not found: {} (checked: {})",
        page_slug,
        attempted.join(" | ")
    ))
}

/// List all wiki page slugs for a course (from the wiki/ directory).
#[tauri::command]
pub async fn list_wiki_pages(
    course_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<String>, String> {
    let dirs = candidate_course_dirs(&course_id, &state.assets_dir, &state.app_data_dir);
    if dirs.is_empty() {
        return Err(format!("Course '{}' not found", course_id));
    }

    let mut wiki_dir = None;
    for course_dir in dirs {
        let candidate = course_dir.join("wiki");
        if candidate.exists() {
            wiki_dir = Some(candidate);
            break;
        }
    }

    let wiki_dir = wiki_dir.ok_or_else(|| format!("Course '{}' has no wiki directory", course_id))?;
    let entries  = std::fs::read_dir(&wiki_dir).map_err(|e| e.to_string())?;

    let mut slugs: Vec<String> = entries
        .flatten()
        .filter_map(|e| {
            let p = e.path();
            if p.extension()?.to_str()? == "md" {
                let stem = p.file_stem()?.to_str()?.to_string();
                // exclude index
                if stem != "index" { Some(stem) } else { None }
            } else {
                None
            }
        })
        .collect();

    slugs.sort();
    Ok(slugs)
}

/// Return the raw manifest JSON for a specific course.
///
/// Checks the user-downloaded location first, then the bundled assets.
#[tauri::command]
pub async fn get_course_manifest(
    course_id: String,
    state: State<'_, AppState>,
) -> Result<serde_json::Value, String> {
    let course_dir = resolve_course_dir(&course_id, &state.assets_dir, &state.app_data_dir)
        .ok_or_else(|| format!("Course '{}' not found", course_id))?;

    let content = std::fs::read_to_string(course_dir.join("manifest.json"))
        .map_err(|e| e.to_string())?;
    serde_json::from_str(&content).map_err(|e| e.to_string())
}

// ── Course management (delete / restore) ─────────────────────────────────────

/// Read the set of bundled course IDs the user has removed, stored as a JSON
/// array under the settings key `"removed_bundled_courses"`.
fn get_removed_set(store: &storage::SessionStore) -> HashSet<String> {
    store
        .get_setting("removed_bundled_courses")
        .ok()
        .flatten()
        .and_then(|v| serde_json::from_str::<Vec<String>>(&v).ok())
        .unwrap_or_default()
        .into_iter()
        .collect()
}

fn save_removed_set(store: &storage::SessionStore, set: &HashSet<String>) -> anyhow::Result<()> {
    let mut ids: Vec<&String> = set.iter().collect();
    ids.sort(); // deterministic order
    let json = serde_json::to_string(&ids)?;
    store.set_setting("removed_bundled_courses", &json)?;
    Ok(())
}

/// Remove a course from the app.
///
/// - **Downloaded** course (`app_data_dir/courses/{id}/` exists): the directory
///   is deleted from disk. If a bundled copy exists it will reappear automatically.
/// - **Bundled-only** course: the id is recorded in settings so it is excluded
///   from the course list on future launches. The files stay in the app bundle.
///
/// After this call the frontend should refresh its course list.
#[tauri::command]
pub async fn remove_course(
    course_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Delete the downloaded copy if it exists.
    let downloaded_dir = state.app_data_dir.join("courses").join(&course_id);
    if downloaded_dir.exists() {
        std::fs::remove_dir_all(&downloaded_dir)
            .map_err(|e| format!("Failed to delete course files: {e}"))?;
        // If a bundled fallback exists the course is now visible again (bundled).
        // Only mark as removed when there is truly no fallback.
        let bundled_dir = state.assets_dir.join("courses").join(&course_id);
        if bundled_dir.join("manifest.json").exists() {
            // Bundled copy will surface on next list_courses — no need to mark removed.
            return Ok(());
        }
    }

    // No bundled fallback (or it was bundled-only to begin with) — mark as removed.
    let store = state.session_store.lock().await;
    let mut removed = get_removed_set(&store);
    removed.insert(course_id);
    save_removed_set(&store, &removed).map_err(|e| e.to_string())
}

/// Restore a previously removed bundled course so it appears in the list again.
///
/// Only applicable to bundled courses whose id is in `removed_bundled_courses`.
/// Downloaded courses that were deleted cannot be restored this way — use
/// the server catalog to re-download them.
#[tauri::command]
pub async fn restore_course(
    course_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let store = state.session_store.lock().await;
    let mut removed = get_removed_set(&store);
    removed.remove(&course_id);
    save_removed_set(&store, &removed).map_err(|e| e.to_string())
}

/// Download an external image URL, cache it under `{app_data_dir}/image_cache/`,
/// and return the absolute path on disk.  Subsequent calls for the same URL
/// return the cached path immediately without a network round-trip.
///
/// This is called by the frontend WikiViewer whenever an `<img>` tag fails to
/// load (dead or rate-limited Wikimedia URL). The frontend converts the
/// returned path to a loadable `asset://` URL via `convertFileSrc`.
#[tauri::command]
pub async fn fetch_image_cached(
    url: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Only fetch http/https URLs.
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("Only http/https URLs are supported".to_string());
    }

    // Derive a stable cache filename from the URL hash + extension.
    let hash = {
        let mut h = Sha256::new();
        h.update(url.as_bytes());
        format!("{:x}", h.finalize())
    };
    let ext = url
        .split('?')
        .next()
        .unwrap_or(&url)
        .rsplit('.')
        .next()
        .filter(|e| e.len() <= 5 && e.chars().all(|c| c.is_ascii_alphanumeric()))
        .unwrap_or("bin");

    let cache_dir = state.app_data_dir.join("image_cache");
    let cached_path = cache_dir.join(format!("{}.{}", &hash[..24], ext));

    // Fast path: already cached.
    if cached_path.exists() {
        return Ok(cached_path.to_string_lossy().into_owned());
    }

    // Create the cache directory if it does not exist yet.
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;

    // Download with a browser-like UA to avoid Wikimedia bot-blocks.
    let client = reqwest::Client::builder()
        .user_agent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
             AppleWebKit/537.36 (KHTML, like Gecko) \
             Chrome/124.0.0.0 Safari/537.36",
        )
        .timeout(std::time::Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("HTTP {}", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    // Guard against unexpectedly large payloads (max 10 MB).
    if bytes.len() > 10 * 1024 * 1024 {
        return Err("Image too large (> 10 MB)".to_string());
    }

    std::fs::write(&cached_path, &bytes).map_err(|e| e.to_string())?;
    Ok(cached_path.to_string_lossy().into_owned())
}
