use serde::{Deserialize, Serialize};
use tauri::State;

use crate::state::AppState;

// ── Request / response types ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct UploadRequest {
    pub file_path: String,
    pub file_name: String,
}

#[derive(Debug, Serialize)]
pub struct UploadResult {
    pub doc_id: String,
    pub chunk_count: usize,
    pub word_count: usize,
}

#[derive(Debug, Serialize)]
pub struct DocumentInfo {
    pub id: String,
    pub file_name: String,
    pub chunk_count: usize,
    pub word_count: usize,
    pub created_at: String,
    pub status: String,
    pub selected: bool,
}

// ── Commands ──────────────────────────────────────────────────────────────────

/// Parse a document from `file_path`, chunk it, embed every chunk with the
/// (lazily loaded) embedding model, and add the embeddings to the HNSW index.
/// Metadata is stored in the settings table under the key `doc:{doc_id}`.
#[tauri::command]
pub async fn upload_document(
    request: UploadRequest,
    state: State<'_, AppState>,
) -> Result<UploadResult, String> {
    let path = std::path::Path::new(&request.file_path);

    // ── 1. Parse the document (PDF / DOCX / TXT auto-detected by extension). ──
    eprintln!("[UPLOAD] Starting document upload: {}", request.file_name);
    let parsed = rag::DocumentParser::parse(path).map_err(|e| {
        eprintln!("[UPLOAD] Parsing failed for {}: {}", request.file_name, e);
        e.to_string()
    })?;
    eprintln!("[UPLOAD] Document parsed: {} chars, {} words", parsed.text.len(), parsed.word_count);

    // ── 2. Chunk into overlapping windows (size and stride from build config). ──
    let chunk_sz = crate::build_config::chunk_size();
    let chunker = rag::Chunker::new(chunk_sz, chunk_sz / 5);
    let doc_id = uuid::Uuid::new_v4().to_string();
    let chunks = chunker.chunk(&doc_id, &parsed.text);
    let chunk_count = chunks.len();

    // ── 3. Embed chunks (load the model on first use). ────────────────────────
    let embeddings = {
        let mut embedder_guard = state.embedder.lock().await;
        if embedder_guard.is_none() {
            let emb_path = state.model_manager.embedding_model_path();
            if emb_path.exists() {
                let n_threads = inference::CpuProfile::detect().recommended_threads;
                *embedder_guard = Some(
                    inference::EmbeddingEngine::load(&emb_path, n_threads)
                        .map_err(|e| e.to_string())?,
                );
            } else {
                return Err(
                    "Embedding model not found. Please download models first.".to_string(),
                );
            }
        }
        let embedder = embedder_guard.as_mut().unwrap();
        let texts: Vec<&str> = chunks.iter().map(|c| c.text.as_str()).collect();
        embedder.embed_batch(&texts).map_err(|e| e.to_string())?
    };

    // ── 4. Insert chunks + embeddings into the HNSW RAG index. ───────────────
    {
        let mut rag = state.rag_index.write().await;
        rag.add_chunks(chunks, embeddings)
            .map_err(|e| e.to_string())?;

        // Persist the updated index to disk.
        let rag_path = state.app_data_dir.join("rag_index.bin");
        if let Err(e) = rag.save(&rag_path) {
            tracing::warn!("Failed to persist RAG index: {e}");
        }
    }

    // ── 5. Save document metadata to SQLite via the settings table. ───────────
    {
        let store = state.session_store.lock().await;
        let doc_meta = serde_json::json!({
            "id":          doc_id,
            "file_name":   request.file_name,
            "file_path":   request.file_path,
            "chunk_count": chunk_count,
            "word_count":  parsed.word_count,
            "created_at":  chrono::Utc::now().to_rfc3339(),
            "status":      "ready",
        });
        store
            .set_setting(&format!("doc:{}", doc_id), &doc_meta.to_string())
            .map_err(|e| e.to_string())?;
    }

    Ok(UploadResult {
        doc_id,
        chunk_count,
        word_count: parsed.word_count,
    })
}

/// Return metadata for all uploaded documents.
///
/// The storage crate stores each document under the settings key `doc:{id}`.
/// We retrieve all such keys and deserialise the JSON blob.
#[tauri::command]
pub async fn list_documents(
    state: State<'_, AppState>,
) -> Result<Vec<DocumentInfo>, String> {
    let store = state.session_store.lock().await;

    // `list_settings_by_prefix` returns (key, value) pairs whose key starts
    // with the given prefix.
    let rows = store
        .list_settings_by_prefix("doc:")
        .map_err(|e| e.to_string())?;

    let mut docs = Vec::with_capacity(rows.len());
    for (_key, value) in rows {
        // Skip tombstoned (deleted) entries.
        if value == "deleted" {
            continue;
        }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&value) {
            let id = v["id"].as_str().unwrap_or("").to_string();
            let sel_key = format!("doc_selected:{}", id);
            let selected = store
                .get_setting(&sel_key)
                .ok()
                .flatten()
                .map(|v| v == "true")
                .unwrap_or(false);
            docs.push(DocumentInfo {
                id,
                file_name: v["file_name"].as_str().unwrap_or("").to_string(),
                chunk_count: v["chunk_count"].as_u64().unwrap_or(0) as usize,
                word_count: v["word_count"].as_u64().unwrap_or(0) as usize,
                created_at: v["created_at"].as_str().unwrap_or("").to_string(),
                status: v["status"].as_str().unwrap_or("unknown").to_string(),
                selected,
            });
        }
    }

    // Most-recent first.
    docs.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(docs)
}

/// Soft-delete a document: remove its chunks from the live HNSW index,
/// persist the updated index, clear the selection flag, and tombstone the
/// metadata so it is no longer returned by `list_documents`.
#[tauri::command]
pub async fn delete_document(
    doc_id: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // Remove chunks from the in-memory HNSW index and persist immediately
    // so deleted docs never reappear after a hot-reload.
    {
        let mut rag = state.rag_index.write().await;
        rag.remove_doc(&doc_id);
        let rag_path = state.app_data_dir.join("rag_index.bin");
        if let Err(e) = rag.save(&rag_path) {
            tracing::warn!("Failed to persist RAG index after delete: {e}");
        }
    }

    let store = state.session_store.lock().await;
    // Clear the selection flag so it does not linger.
    store
        .set_setting(&format!("doc_selected:{}", doc_id), "false")
        .map_err(|e| e.to_string())?;
    // Tombstone the metadata entry.
    store
        .set_setting(&format!("doc:{}", doc_id), "deleted")
        .map_err(|e| e.to_string())
}

/// Toggle whether a document is included in RAG searches.
/// Selection state is persisted in the settings table as `doc_selected:{id}`.
#[tauri::command]
pub async fn toggle_doc_selection(
    doc_id: String,
    selected: bool,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let store = state.session_store.lock().await;
    store
        .set_setting(
            &format!("doc_selected:{}", doc_id),
            if selected { "true" } else { "false" },
        )
        .map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::fs;
    use std::path::PathBuf;

    use anyhow::Result;
    use tempfile::TempDir;

    fn tauri_state(state: &AppState) -> State<'_, AppState> {
        // `tauri::State` is a transparent wrapper around `&T`, but its field is
        // private. For an in-crate backend probe we can safely mirror the layout.
        unsafe { std::mem::transmute::<&AppState, State<'_, AppState>>(state) }
    }

    fn home_path() -> Option<PathBuf> {
        std::env::var_os("HOME").map(PathBuf::from)
    }

    #[tokio::test]
    async fn upload_document_indexes_pdf_and_persists_metadata() -> Result<()> {
        let Some(home) = home_path() else {
            eprintln!("[SKIP] HOME is not set");
            return Ok(());
        };

        let pdf_path = home.join("Downloads").join("1.pdf");
        if !pdf_path.exists() {
            eprintln!("[SKIP] PDF not found at {}", pdf_path.display());
            return Ok(());
        }

        let embed_src = home
            .join(".local/share/com.studentai.app/models")
            .join(crate::build_config::EMBED_FILE);
        if !embed_src.exists() {
            eprintln!("[SKIP] Embedding model not found at {}", embed_src.display());
            return Ok(());
        }

        let tmp = TempDir::new()?;
        let app_data_dir = tmp.path().join("appdata");
        let models_dir = app_data_dir.join("models");
        fs::create_dir_all(&models_dir)?;
        fs::copy(&embed_src, models_dir.join(crate::build_config::EMBED_FILE))?;

        let state = crate::setup::initialize(app_data_dir.clone())?;
        let request = UploadRequest {
            file_path: pdf_path.to_string_lossy().into_owned(),
            file_name: "1.pdf".to_string(),
        };

        let result = upload_document(request, tauri_state(&state))
            .await
            .map_err(anyhow::Error::msg)?;

        assert!(result.chunk_count > 0, "expected uploaded PDF to produce chunks");
        assert!(result.word_count > 1_000, "expected uploaded PDF to contain substantial text");
        assert!(app_data_dir.join("rag_index.bin").exists(), "expected RAG index to persist to disk");

        let docs = list_documents(tauri_state(&state))
            .await
            .map_err(anyhow::Error::msg)?;
        let uploaded = docs.iter().find(|doc| doc.id == result.doc_id).expect("uploaded doc should be listed");
        assert_eq!(uploaded.file_name, "1.pdf");
        assert_eq!(uploaded.chunk_count, result.chunk_count);
        assert_eq!(uploaded.word_count, result.word_count);
        assert_eq!(uploaded.status, "ready");

        delete_document(result.doc_id.clone(), tauri_state(&state))
            .await
            .map_err(anyhow::Error::msg)?;
        let docs_after_delete = list_documents(tauri_state(&state))
            .await
            .map_err(anyhow::Error::msg)?;
        assert!(
            docs_after_delete.iter().all(|doc| doc.id != result.doc_id),
            "deleted document should not be listed"
        );

        Ok(())
    }
}
