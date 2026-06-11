/// Performance, deployment, and model settings baked in at compile time.
///
/// Two config files control what gets baked in:
///   - `src-tauri/build_config.toml` — deployment knobs (expiry, server URL, RAG params)
///   - `src-tauri/models.toml`       — model URLs, filenames, sizes
///
/// To switch models: edit models.toml, then `cargo tauri build`.  No code changes.
/// Students cannot modify any of these values after the binary is compiled.

use chrono::{NaiveDate, Utc};

// Raw compile-time string constants from build.rs / build_config.toml
const _N_CTX_STR:               &str = env!("BUILD_N_CTX");
const _CHUNK_SIZE_STR:           &str = env!("BUILD_CHUNK_SIZE");
const _RAG_TOP_K_STR:            &str = env!("BUILD_RAG_TOP_K");
const _MAX_INFERENCE_THREADS_STR: &str = env!("BUILD_MAX_INFERENCE_THREADS");
const _SELF_DELETE_GRACE_STR:    &str = env!("BUILD_SELF_DELETE_GRACE_DAYS");

/// Remote server base URL for telemetry and course updates (no trailing slash).
pub const SERVER_URL: &str = env!("BUILD_SERVER_URL");

/// Campus LAN base URL — used when the public URL is unreachable from inside
/// the campus network (NAT hairpin issue).  Empty string = disabled.
pub const SERVER_URL_LAN: &str = env!("BUILD_SERVER_URL_LAN");

const _MAX_INSTALL_DAYS_STR: &str = env!("BUILD_MAX_INSTALL_DAYS");
const _INACTIVITY_DAYS_STR:  &str = env!("BUILD_INACTIVITY_DAYS");

/// Maximum days from first install before auto-uninstall (0 = disabled).
pub fn max_install_days() -> i64 { _MAX_INSTALL_DAYS_STR.trim().parse().unwrap_or(180) }

/// Days of inactivity (no telemetry poll) before auto-uninstall (0 = disabled).
pub fn inactivity_days() -> i64 { _INACTIVITY_DAYS_STR.trim().parse().unwrap_or(30) }

/// ISO 8601 expiry date ("" = no expiry).
pub const EXPIRY_DATE: &str = env!("BUILD_EXPIRY_DATE");

/// Whether to wipe user data on expiry.
pub const SELF_DELETE_ON_EXPIRY: bool = {
    let s = env!("BUILD_SELF_DELETE");
    // Manual byte comparison since `==` on &str is not const-stable
    s.len() == 4
        && s.as_bytes()[0] == b't'
        && s.as_bytes()[1] == b'r'
        && s.as_bytes()[2] == b'u'
        && s.as_bytes()[3] == b'e'
};

/// Warning message shown when expiry is approaching.
pub const EXPIRY_WARNING: &str = env!("BUILD_EXPIRY_WARNING");

// Runtime-parsed values (strings can't be parsed in const context in stable Rust).

fn parse_u32(s: &str, default: u32) -> u32 {
    s.trim().parse().unwrap_or(default)
}

/// Maximum (ceiling) LLM context window size in tokens.
///
/// This value is the upper bound baked in at compile time via `build_config.toml`.
/// The actual runtime value may be overridden at runtime by the server.
pub fn n_ctx() -> u32 { parse_u32(_N_CTX_STR, 4096) }

/// Hard ceiling on inference thread count (0 = pure runtime auto-detection).
///
/// Applied on top of `CpuProfile::detect()` so that the app behaves like a
/// student laptop even when run on a high-core developer machine.
pub fn max_inference_threads() -> u32 { parse_u32(_MAX_INFERENCE_THREADS_STR, 4) }

/// RAG chunk size in characters.
pub fn chunk_size() -> usize { _CHUNK_SIZE_STR.trim().parse().unwrap_or(1600) }

/// Number of RAG chunks retrieved per query.
pub fn rag_top_k() -> usize { _RAG_TOP_K_STR.trim().parse().unwrap_or(2) }

/// Days of warning shown before self-delete begins.
pub fn self_delete_grace_days() -> i64 { _SELF_DELETE_GRACE_STR.trim().parse().unwrap_or(7) }

// ---------------------------------------------------------------------------
// Model configuration (from models.toml via build.rs)
// ---------------------------------------------------------------------------

/// Download URL for the active LLM.
/// Change models.toml [llm] url and rebuild to switch models.
pub const LLM_URL: &str = env!("BUILD_LLM_URL");

/// Original filename of the LLM as downloaded from upstream.
/// Used in bundled_model/ so developers see which model is in each build.
/// On the student machine the file is renamed to LLM_FILE (chat-model.gguf).
pub const LLM_SOURCE_FILE: &str = env!("BUILD_LLM_SOURCE_FILE");

/// Installed-as filename on the student machine (always "chat-model.gguf").
/// Never shown to students.
pub const LLM_FILE: &str = env!("BUILD_LLM_FILE");

/// When `true`, the active LLM is a thinking model (e.g. Qwen3) and the
/// `/no_think` prefix will be appended to the system prompt so that thinking
/// mode is disabled — keeping inference fast on student hardware.
pub const LLM_NO_THINK: bool = {
    let s = env!("BUILD_LLM_NO_THINK");
    s.len() == 4
        && s.as_bytes()[0] == b't'
        && s.as_bytes()[1] == b'r'
        && s.as_bytes()[2] == b'u'
        && s.as_bytes()[3] == b'e'
};

/// Download URL for the active embedding model.
pub const EMBED_URL: &str = env!("BUILD_EMBED_URL");

/// Original filename of the embedding model as downloaded from upstream.
/// Used in bundled_model/ for fully bundled course + RAG builds.
pub const EMBED_SOURCE_FILE: &str = env!("BUILD_EMBED_SOURCE_FILE");

/// Installed-as filename on the student machine (always "rag-model.gguf").
pub const EMBED_FILE: &str = env!("BUILD_EMBED_FILE");

// ---------------------------------------------------------------------------
// Expiry helpers
// ---------------------------------------------------------------------------

/// Returns `None` if no expiry is configured, otherwise days remaining
/// (negative = already expired by that many days).
pub fn days_until_expiry() -> Option<i64> {
    if EXPIRY_DATE.is_empty() {
        return None;
    }
    let expiry = NaiveDate::parse_from_str(EXPIRY_DATE, "%Y-%m-%d").ok()?;
    let today = Utc::now().date_naive();
    Some((expiry - today).num_days())
}

/// Returns `true` if the deployment has passed its expiry date.
pub fn is_expired() -> bool {
    days_until_expiry().map(|d| d < 0).unwrap_or(false)
}

/// Returns `true` if user data should be wiped now:
/// expiry configured + self-delete enabled + grace period over.
pub fn should_self_delete() -> bool {
    SELF_DELETE_ON_EXPIRY
        && !EXPIRY_DATE.is_empty()
        && days_until_expiry().map(|d| d < -self_delete_grace_days()).unwrap_or(false)
}
