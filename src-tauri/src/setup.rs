use std::path::PathBuf;
use std::sync::Arc;

use crate::license::LicenseManager;
use crate::state::AppState;

pub fn initialize(app_data_dir: PathBuf) -> anyhow::Result<AppState> {
    // ── Directories ──────────────────────────────────────────────────────────
    let models_dir = app_data_dir.join("models");
    std::fs::create_dir_all(&models_dir)?;

    // ── Activity-based license ────────────────────────────────────────────────
    let license_manager = LicenseManager::load(&app_data_dir);

    // ── Model manager ────────────────────────────────────────────────────────
    // ── Model manager ────────────────────────────────────────────────────
    // Filenames come from build_config (baked from models.toml at compile time):
    // chat-model-1.gguf, rag-model-1.gguf, etc. — slot-numbered, never shown to students.
    let model_manager = inference::ModelManager::new(
        models_dir.clone(),
        crate::build_config::LLM_FILE,
        crate::build_config::EMBED_FILE,
    );

    // ── Storage (SQLite) ─────────────────────────────────────────────────────
    let db_path = app_data_dir.join("student_ai.db");
    let session_store = storage::SessionStore::new(&db_path)?;

    // ── RAG index ────────────────────────────────────────────────────────────
    let rag_path = app_data_dir.join("rag_index.bin");
    let rag_index = if rag_path.exists() {
        rag::RagIndex::load(&rag_path).unwrap_or_else(|_| rag::RagIndex::new())
    } else {
        rag::RagIndex::new()
    };

    // ── Endpoint resolver (handles campus NAT hairpin) ────────────────────────
    // Build an ordered candidate list: LAN IP first (lower latency on campus),
    // public URL as fallback.  Overrides from the settings DB are respected.
    let mut candidates: Vec<String> = Vec::new();

    // LAN URL: settings DB > build-time constant
    let lan_url = session_store
        .get_setting("server_url_lan")
        .ok()
        .flatten()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| crate::build_config::SERVER_URL_LAN.to_string());
    if !lan_url.is_empty() {
        candidates.push(lan_url);
    }

    // Public URL: settings DB > build-time constant
    let public_url = session_store
        .get_setting("server_url")
        .ok()
        .flatten()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| crate::build_config::SERVER_URL.to_string());
    if !public_url.is_empty() {
        candidates.push(public_url.clone());
    }

    let endpoint_resolver = telemetry::EndpointResolver::new(candidates);

    // ── Telemetry ─────────────────────────────────────────────────────────────
    // Telemetry is only active when the user has explicitly given consent.
    // consent_given must be "true" AND telemetry_enabled must not be "false".
    let consent_given = session_store
        .get_setting("consent_given")
        .ok()
        .flatten()
        .map(|v| v == "true")
        .unwrap_or(false);

    let telemetry_opt_out = session_store
        .get_setting("telemetry_enabled")
        .ok()
        .flatten()
        .map(|v| v == "false")
        .unwrap_or(false);

    let telemetry_enabled = consent_given && !telemetry_opt_out;

    // Endpoint starts as public_url; background task will update it via resolver.
    let telemetry_endpoint = format!("{}/v1/sessions", public_url);
    let telemetry = telemetry::TelemetrySender::new(telemetry_endpoint, telemetry_enabled);

    // ── Telemetry offline queue ───────────────────────────────────────────────
    let telemetry_queue = telemetry::TelemetryQueue::load(&app_data_dir);

    // ── Exe / assets directory (bundled alongside the executable) ────────────
    let exe_dir = std::env::current_exe()
        .unwrap_or_default()
        .parent()
        .unwrap_or_else(|| std::path::Path::new("."))
        .to_path_buf();

    // ── Bundled-model extraction (withmodel installer variant) ───────────────
    // In dev mode, assets might be at the workspace root; try that if the
    // exe-relative path doesn't exist.
    let assets_dir = {
        let candidate = exe_dir.join("assets");
        if candidate.exists() {
            candidate
        } else {
            // Dev mode: walk up from exe_dir to find workspace root
            let mut current = exe_dir.clone();
            let mut found_assets: Option<std::path::PathBuf> = None;
            for _ in 0..5 {
                current = current.parent().unwrap_or_else(|| std::path::Path::new(".")).to_path_buf();
                let workspace_assets = current.join("assets");
                if workspace_assets.exists() {
                    found_assets = Some(workspace_assets);
                    break;
                }
            }
            // Fallback: use exe-relative path even if it doesn't exist
            found_assets.unwrap_or_else(|| exe_dir.join("assets"))
        }
    };
    // Bundled builds ship the GGUFs alongside the executable using their
    // original upstream filenames. On first launch we copy them into the
    // writable models directory under the stable slot filenames the app uses.
    let bundled_models_dir = exe_dir.join("bundled_model");

    // Offline-installer sidecar: llm.gguf placed next to the exe (or setup.exe
    // when the NSIS hook ran before the copy reached AppData). Check this first
    // so the app never needs to go online when the file is already local.
    let llm_dest = models_dir.join(crate::build_config::LLM_FILE);
    let llm_sidecar = exe_dir.join("llm.gguf");
    if llm_sidecar.is_file() && !llm_dest.is_file() {
        tracing::info!(
            src = %llm_sidecar.display(),
            dest = %llm_dest.display(),
            "Copying llm.gguf sidecar to models directory"
        );
        if let Err(e) = std::fs::copy(&llm_sidecar, &llm_dest) {
            tracing::warn!("Failed to copy llm.gguf sidecar: {e}");
        }
    }

    for (source_file, target_file, model_kind) in [
        (
            crate::build_config::LLM_SOURCE_FILE,
            crate::build_config::LLM_FILE,
            "llm",
        ),
        (
            crate::build_config::EMBED_SOURCE_FILE,
            crate::build_config::EMBED_FILE,
            "embedding",
        ),
    ] {
        let bundled_src = bundled_models_dir.join(source_file);
        let bundled_dest = models_dir.join(target_file);
        if bundled_src.is_file() && !bundled_dest.is_file() {
            tracing::info!(
                model_kind,
                src = %bundled_src.display(),
                dest = %bundled_dest.display(),
                "Extracting bundled model to models directory"
            );
            if let Err(e) = std::fs::copy(&bundled_src, &bundled_dest) {
                tracing::warn!(model_kind, "Failed to copy bundled model: {e}");
            }
        }
    }

    // ── LLM (optional, loaded lazily if model missing) ───────────────────────
    // Detect optimal thread count, then apply the build-time ceiling so the app
    // behaves consistently on student hardware regardless of where it was tested.
    // max_inference_threads=4 targets LPDDR4/5 bandwidth saturation on laptops.
    // The LLAMA_THREADS env var still overrides everything for benchmarking.
    let cpu_profile     = inference::CpuProfile::detect();
    let max_threads_cap = crate::build_config::max_inference_threads();

    // User override from settings DB (set in the Settings panel, requires restart).
    let user_threads: Option<u32> = session_store
        .get_setting("inference_threads")
        .ok()
        .flatten()
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|&t| t > 0 && t <= 256);

    let n_threads: u32 = if let Some(ut) = user_threads {
        tracing::info!(user_override = ut, "Using user-configured inference thread count");
        ut as u32
    } else if max_threads_cap > 0 {
        cpu_profile.recommended_threads.min(max_threads_cap)
    } else {
        cpu_profile.recommended_threads
    };
    tracing::info!(
        recommended = cpu_profile.recommended_threads,
        cap         = max_threads_cap,
        actual      = n_threads,
        "Inference thread count selected"
    );
    let llm_path = model_manager.llm_model_path();
    let (available_ram_mb, total_ram_mb) = inference::ModelManager::ram_snapshot_mb();

    // User can override n_ctx from settings (smaller = less KV-cache RAM).
    let user_n_ctx: Option<u32> = session_store
        .get_setting("inference_n_ctx")
        .ok()
        .flatten()
        .and_then(|v| v.parse::<u32>().ok())
        .filter(|&c| c >= 512);

    let configured_n_ctx = user_n_ctx.unwrap_or_else(|| crate::build_config::n_ctx());
    tracing::info!(
        available_ram_mb,
        total_ram_mb,
        configured_n_ctx,
        user_ctx_override = user_n_ctx,
        "Configured n_ctx ceiling (runtime will adapt per-inference to available RAM)"
    );
    let llm = if llm_path.exists() {
        match inference::LlmEngine::load(&llm_path, n_threads, configured_n_ctx) {
            Ok(mut engine) => {
                tracing::info!("LLM loaded from {:?}", llm_path);
                // ── Warm-up inference ─────────────────────────────────────────
                // Run a single minimal prompt immediately after load to:
                //   1. Pre-fault all 2.5 GB of model weight pages from SSD into RAM.
                //   2. Pre-allocate + pre-zero the KV-cache before the first user request.
                // Without this, Windows mmap page-faults during the first user
                // inference cost 20-30 s (640 K pages × ~50 μs SSD latency).
                // The warm-up itself is short (~1 token) so it completes in < 5 s
                // while the app is still showing its loading screen.
                let warmup_msgs = vec![inference::ChatMessage {
                    role: "user".to_string(),
                    content: "hi".to_string(),
                }];
                let warmup_params = inference::GenerationParams {
                    max_tokens: 1,
                    ..Default::default()
                };
                match engine.generate_text(&warmup_msgs, &warmup_params) {
                    Ok(_) => tracing::info!("LLM warm-up complete — model pages resident in RAM"),
                    Err(e) => tracing::warn!("LLM warm-up failed (non-fatal): {e}"),
                }
                // Discard the warm-up context.
                //
                // The warm-up runs before WebView2 has fully allocated its ~900 MB, so
                // available_mb is inflated and the warm-up context ends up with a much
                // larger n_ctx than real inference calls need (e.g. 4096 vs 2048).
                // Reusing that oversized context makes GGML's attention O(n_ctx²) per
                // token — 4–8× slower prefill on every subsequent call.
                //
                // Discarding here costs nothing: the warm-up already faulted all model
                // weight pages into RAM (its sole purpose).  The first real inference
                // call creates a correctly-sized context once WebView2 RAM usage is known.
                engine.discard_ctx_cache();
                Some(engine)
            }
            Err(e) => {
                tracing::warn!("Failed to load LLM: {e}");
                None
            }
        }
    } else {
        tracing::warn!("LLM model not found at {:?}", llm_path);
        None
    };

    // ── Embedding model (eager pre-load for faster first UserDocs query) ─────
    // BGE-small is only 35 MB, so loading at startup costs <0.5 s and eliminates
    // the cold-start delay on the first UserDocs RAG query.
    let emb_path = model_manager.embedding_model_path();
    let embedder_opt: Option<inference::EmbeddingEngine> = if emb_path.exists() {
        match inference::EmbeddingEngine::load(&emb_path, n_threads) {
            Ok(e) => {
                tracing::info!("Embedding model pre-loaded from {:?}", emb_path);
                Some(e)
            }
            Err(e) => {
                tracing::warn!("Failed to pre-load embedding model: {e}");
                None
            }
        }
    } else {
        tracing::warn!("Embedding model not found at {:?}", emb_path);
        None
    };

    // ── Assemble state ───────────────────────────────────────────────────────
    Ok(AppState {
        llm: Arc::new(tokio::sync::Mutex::new(llm)),
        embedder: Arc::new(tokio::sync::Mutex::new(embedder_opt)),
        wiki_engines: Arc::new(tokio::sync::RwLock::new(
            std::collections::HashMap::new(),
        )),
        rag_index: Arc::new(tokio::sync::RwLock::new(rag_index)),
        session_store: Arc::new(tokio::sync::Mutex::new(session_store)),
        telemetry: Arc::new(telemetry),
        telemetry_queue: Arc::new(telemetry_queue),
        endpoint_resolver: Arc::new(endpoint_resolver),
        orchestrator: Arc::new(tokio::sync::Mutex::new(
            agents::AgentOrchestrator::new(),
        )),
        model_manager: Arc::new(model_manager),
        license_manager: Arc::new(tokio::sync::Mutex::new(license_manager)),
        app_data_dir,
        assets_dir,
        cancel_flag: Arc::new(std::sync::atomic::AtomicBool::new(false)),
        is_inferring: Arc::new(std::sync::atomic::AtomicBool::new(false)),
    })
}

/// Wipe all user-generated data (chats, RAG index, uploaded docs, settings).
/// Models are preserved — they are large and not user-specific.
/// Called when `should_self_delete()` returns true.
pub fn wipe_user_data(app_data_dir: &PathBuf) {
    let to_delete = [
        "student_ai.db",       // all chats, sessions, settings
        "rag_index.bin",       // document vector index
        "uploaded_docs",       // raw uploaded PDF/TXT files (if stored)
    ];
    for name in &to_delete {
        let path = app_data_dir.join(name);
        if path.is_file() {
            let _ = std::fs::remove_file(&path);
            tracing::info!("Wiped: {}", path.display());
        } else if path.is_dir() {
            let _ = std::fs::remove_dir_all(&path);
            tracing::info!("Wiped dir: {}", path.display());
        }
    }
    tracing::warn!("User data wipe complete (models preserved)");
}
