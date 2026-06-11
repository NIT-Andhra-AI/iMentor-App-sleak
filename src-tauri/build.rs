use std::collections::HashMap;

fn main() {
    // ── Auto-regenerate tauri configs when workspace.toml changes ─────────────
    // This ensures `cargo tauri build` can be run directly without manually
    // running `python scripts/gen-config.py` first. Works on Windows (python3
    // or python) and Linux/macOS (python3).
    let repo_root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).parent()
        .expect("src-tauri has a parent");
    let gen_script = repo_root.join("scripts").join("gen-config.py");
    if gen_script.exists() {
        let python = if cfg!(target_os = "windows") { "python" } else { "python3" };
        let status = std::process::Command::new(python)
            .arg(&gen_script)
            .current_dir(repo_root)
            .status();
        match status {
            Ok(s) if s.success() => {}
            Ok(s) => eprintln!("cargo:warning=gen-config.py exited with {s}"),
            Err(e) => eprintln!("cargo:warning=Could not run gen-config.py: {e}"),
        }
    }

    // ── Tauri required build step ────────────────────────────────────────────
    tauri_build::build();

    // ── Read build_config.toml (deployment settings) ─────────────────────────
    load_build_config();

    // ── Read models.toml (model URLs / filenames) ─────────────────────────────
    // Edit models.toml to switch or add models — no code changes needed.
    load_models_config();

    println!("cargo:rerun-if-changed=build_config.toml");
    println!("cargo:rerun-if-changed=../../workspace.toml");
    // models rerun-if-changed is handled inside load_models_config()
}

fn load_build_config() {
    let config_path = std::path::Path::new("build_config.toml");
    if config_path.exists() {
        let src = std::fs::read_to_string(config_path)
            .expect("Failed to read build_config.toml");
        let config: HashMap<String, toml::Value> =
            toml::from_str(&src).expect("Invalid build_config.toml");

        fn get_str<'a>(cfg: &'a HashMap<String, toml::Value>, key: &str, default: &'a str) -> &'a str {
            match cfg.get(key) {
                Some(toml::Value::String(s)) => s.as_str(),
                _ => default,
            }
        }
        fn get_int(cfg: &HashMap<String, toml::Value>, key: &str, default: i64) -> i64 {
            match cfg.get(key) {
                Some(toml::Value::Integer(n)) => *n,
                _ => default,
            }
        }
        fn get_bool(cfg: &HashMap<String, toml::Value>, key: &str, default: bool) -> bool {
            match cfg.get(key) {
                Some(toml::Value::Boolean(b)) => *b,
                _ => default,
            }
        }

        println!("cargo:rustc-env=BUILD_N_CTX={}",     get_int(&config, "n_ctx",     4096));
        println!("cargo:rustc-env=BUILD_CHUNK_SIZE={}", get_int(&config, "chunk_size", 1600));
        println!("cargo:rustc-env=BUILD_RAG_TOP_K={}",  get_int(&config, "rag_top_k",  2));
        println!("cargo:rustc-env=BUILD_QUANT_FORMAT={}", get_str(&config, "quant_format", "q4_k_m"));
        println!("cargo:rustc-env=BUILD_MAX_INFERENCE_THREADS={}", get_int(&config, "max_inference_threads", 4));
        println!("cargo:rustc-env=BUILD_SERVER_URL={}", get_str(&config, "server_url", "https://your-server-ip-or-domain"));
        println!("cargo:rustc-env=BUILD_SERVER_URL_LAN={}", get_str(&config, "server_url_lan", ""));
        println!("cargo:rustc-env=BUILD_MAX_INSTALL_DAYS={}", get_int(&config, "max_install_days", 180));
        println!("cargo:rustc-env=BUILD_INACTIVITY_DAYS={}",  get_int(&config, "inactivity_days",  30));
        println!("cargo:rustc-env=BUILD_EXPIRY_DATE={}", get_str(&config, "expiry_date", ""));
        println!("cargo:rustc-env=BUILD_SELF_DELETE={}",
            get_bool(&config, "self_delete_on_expiry", false));
        println!("cargo:rustc-env=BUILD_SELF_DELETE_GRACE_DAYS={}",
            get_int(&config, "self_delete_grace_days", 7));
        println!("cargo:rustc-env=BUILD_EXPIRY_WARNING={}",
            get_str(&config, "expiry_warning_message", "This version has expired."));
    } else {
        println!("cargo:rustc-env=BUILD_N_CTX=4096");
        println!("cargo:rustc-env=BUILD_CHUNK_SIZE=1600");
        println!("cargo:rustc-env=BUILD_RAG_TOP_K=2");
        println!("cargo:rustc-env=BUILD_QUANT_FORMAT=q4_k_m");
        println!("cargo:rustc-env=BUILD_MAX_INFERENCE_THREADS=4");
        println!("cargo:rustc-env=BUILD_SERVER_URL=https://your-server-ip-or-domain");
        println!("cargo:rustc-env=BUILD_SERVER_URL_LAN=");
        println!("cargo:rustc-env=BUILD_MAX_INSTALL_DAYS=180");
        println!("cargo:rustc-env=BUILD_INACTIVITY_DAYS=30");
        println!("cargo:rustc-env=BUILD_EXPIRY_DATE=");
        println!("cargo:rustc-env=BUILD_SELF_DELETE=false");
        println!("cargo:rustc-env=BUILD_SELF_DELETE_GRACE_DAYS=7");
        println!("cargo:rustc-env=BUILD_EXPIRY_WARNING=This version has expired.");
    }
}

/// Reads a models TOML file and bakes model URLs + metadata into the binary.
///
/// The file to read is controlled by the `STUDENT_AI_MODELS` environment
/// variable (e.g. `STUDENT_AI_MODELS=models-qwen3.toml`).  Defaults to
/// `models.toml` when the variable is not set.
///
/// To switch models: either edit `models.toml` or point `STUDENT_AI_MODELS`
/// at an alternative config, then rebuild — no Rust code changes needed.
fn load_models_config() {
    // Allow CI / local builds to override which models file is used.
    let models_filename = std::env::var("STUDENT_AI_MODELS")
        .unwrap_or_else(|_| "models.toml".to_string());
    println!("cargo:rerun-if-env-changed=STUDENT_AI_MODELS");
    println!("cargo:rerun-if-changed={models_filename}");

    // Defaults (kept in sync with models.toml)
    let mut llm_url         = "https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf?download=true".to_string();
    let mut llm_source_file = "Phi-4-mini-instruct-Q4_K_M.gguf".to_string();
    let mut llm_file        = "chat-model-1.gguf".to_string();
    let mut llm_size_mb     = 2376i64;
    let mut llm_no_think    = false;
    let mut embed_url         = "https://huggingface.co/CompendiumLabs/bge-small-en-v1.5-gguf/resolve/main/bge-small-en-v1.5-q8_0.gguf".to_string();
    let mut embed_source_file = "bge-small-en-v1.5-q8_0.gguf".to_string();
    let mut embed_file        = "rag-model-1.gguf".to_string();
    let mut embed_size_mb     = 35i64;

    let models_path = std::path::Path::new(&models_filename);
    if models_path.exists() {
        let src = std::fs::read_to_string(models_path)
            .unwrap_or_else(|_| panic!("Failed to read {models_filename}"));
        let config: toml::Value =
            toml::from_str(&src).unwrap_or_else(|e| panic!("Invalid {models_filename}: {e}"));

        if let Some(llm) = config.get("llm") {
            if let Some(v) = llm.get("url").and_then(|v| v.as_str())           { llm_url         = v.to_string(); }
            if let Some(v) = llm.get("source_file").and_then(|v| v.as_str())   { llm_source_file = v.to_string(); }
            if let Some(v) = llm.get("file_name").and_then(|v| v.as_str())     { llm_file        = v.to_string(); }
            if let Some(v) = llm.get("size_mb").and_then(|v| v.as_integer())   { llm_size_mb     = v; }
            if let Some(v) = llm.get("no_think").and_then(|v| v.as_bool())     { llm_no_think    = v; }
        }
        if let Some(emb) = config.get("embedding") {
            if let Some(v) = emb.get("url").and_then(|v| v.as_str())           { embed_url         = v.to_string(); }
            if let Some(v) = emb.get("source_file").and_then(|v| v.as_str())   { embed_source_file = v.to_string(); }
            if let Some(v) = emb.get("file_name").and_then(|v| v.as_str())     { embed_file        = v.to_string(); }
            if let Some(v) = emb.get("size_mb").and_then(|v| v.as_integer())   { embed_size_mb     = v; }
        }
    } else {
        eprintln!("cargo:warning={models_filename} not found — using built-in defaults (Phi-4-mini + BGE-small)");
    }

    println!("cargo:rustc-env=BUILD_LLM_URL={llm_url}");
    println!("cargo:rustc-env=BUILD_LLM_SOURCE_FILE={llm_source_file}");
    println!("cargo:rustc-env=BUILD_LLM_FILE={llm_file}");
    println!("cargo:rustc-env=BUILD_LLM_SIZE_MB={llm_size_mb}");
    println!("cargo:rustc-env=BUILD_LLM_NO_THINK={llm_no_think}");
    println!("cargo:rustc-env=BUILD_EMBED_URL={embed_url}");
    println!("cargo:rustc-env=BUILD_EMBED_SOURCE_FILE={embed_source_file}");
    println!("cargo:rustc-env=BUILD_EMBED_FILE={embed_file}");
    println!("cargo:rustc-env=BUILD_EMBED_SIZE_MB={embed_size_mb}");
}

