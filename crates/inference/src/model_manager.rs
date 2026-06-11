use std::path::PathBuf;
use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};
use tracing::debug;

/// Manages the on-disk locations of model files and provides basic
/// system-resource information used to decide whether models can be loaded.
///
/// Filenames are passed in at construction time from build_config constants
/// (e.g. "chat-model-1.gguf") so they stay in sync with the active model
/// slot defined in models.toml — no hardcoded strings here.
#[derive(Debug, Clone)]
pub struct ModelManager {
    /// Root directory that contains all `.gguf` model files.
    pub models_dir: PathBuf,
    /// Installed-as filename for the active LLM (e.g. "chat-model-1.gguf").
    llm_file: String,
    /// Installed-as filename for the active embedding model (e.g. "rag-model-1.gguf").
    embed_file: String,
}

impl ModelManager {
    /// Create a new `ModelManager`.
    ///
    /// `llm_file` and `embed_file` come from `build_config::LLM_FILE` /
    /// `build_config::EMBED_FILE` — the slot-numbered filenames baked in at
    /// compile time from `models.toml`.
    pub fn new(models_dir: PathBuf, llm_file: &str, embed_file: &str) -> Self {
        Self {
            models_dir,
            llm_file: llm_file.to_string(),
            embed_file: embed_file.to_string(),
        }
    }

    // -----------------------------------------------------------------------
    // Model path accessors
    // -----------------------------------------------------------------------

    /// Absolute path to the chat/LLM model file (e.g. `.../chat-model-1.gguf`).
    pub fn llm_model_path(&self) -> PathBuf {
        self.models_dir.join(&self.llm_file)
    }

    /// Absolute path to the RAG embedding model file (e.g. `.../rag-model-1.gguf`).
    pub fn embedding_model_path(&self) -> PathBuf {
        self.models_dir.join(&self.embed_file)
    }

    // -----------------------------------------------------------------------
    // Existence checks
    // -----------------------------------------------------------------------

    /// Returns `true` if the LLM file exists on disk and is a regular file.
    pub fn llm_exists(&self) -> bool {
        let p = self.llm_model_path();
        let exists = p.is_file();
        debug!(path = %p.display(), exists, "LLM existence check");
        exists
    }

    /// Returns `true` if the embedding model file exists on disk and is a regular file.
    pub fn embedding_exists(&self) -> bool {
        let p = self.embedding_model_path();
        let exists = p.is_file();
        debug!(path = %p.display(), exists, "Embedding model existence check");
        exists
    }

    // -----------------------------------------------------------------------
    // System resource helpers
    // -----------------------------------------------------------------------

    /// Available physical RAM in mebibytes (MiB) at the time of the call.
    ///
    /// Uses `sysinfo` to query the OS; the value reflects currently free memory,
    /// not total installed RAM.
    pub fn available_ram_mb() -> u64 {
        Self::ram_snapshot_mb().0
    }

    /// Returns `(available_ram_mb, total_ram_mb)` in MiB.
    pub fn ram_snapshot_mb() -> (u64, u64) {
        let mut sys = System::new();
        sys.refresh_memory();
        // `available_memory()` returns bytes in sysinfo 0.30.
        let available_mib = sys.available_memory() / (1024 * 1024);
        let total_mib = sys.total_memory() / (1024 * 1024);
        debug!(available_ram_mib = available_mib, total_ram_mib = total_mib, "RAM snapshot queried");
        (available_mib, total_mib)
    }

    /// Returns `(app_ram_mb, app_cpu_pct)` for the current process.
    pub fn app_process_stats() -> (u64, f32) {
        let pid = Pid::from_u32(std::process::id());
        let kind = ProcessRefreshKind::new().with_memory().with_cpu();
        let mut sys = System::new_with_specifics(
            RefreshKind::new().with_processes(kind),
        );
        sys.refresh_process_specifics(pid, kind);
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        sys.refresh_process_specifics(pid, kind);
        if let Some(proc) = sys.process(pid) {
            let ram_mib = proc.memory() / (1024 * 1024);
            let cpu_pct = proc.cpu_usage();
            (ram_mib, cpu_pct)
        } else {
            (0, 0.0)
        }
    }


}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::PathBuf;

    #[test]
    fn test_model_paths() {
        let mm = ModelManager::new(
            PathBuf::from("/tmp/models"),
            "chat-model-1.gguf",
            "rag-model-1.gguf",
        );
        assert_eq!(mm.llm_model_path(), PathBuf::from("/tmp/models/chat-model-1.gguf"));
        assert_eq!(mm.embedding_model_path(), PathBuf::from("/tmp/models/rag-model-1.gguf"));
    }

    #[test]
    fn test_slot_numbering() {
        // Different slots for different models
        let mm2 = ModelManager::new(
            PathBuf::from("/tmp/models"),
            "chat-model-2.gguf",
            "rag-model-2.gguf",
        );
        assert_eq!(mm2.llm_model_path(), PathBuf::from("/tmp/models/chat-model-2.gguf"));
        assert_eq!(mm2.embedding_model_path(), PathBuf::from("/tmp/models/rag-model-2.gguf"));
    }

    #[test]
    fn test_non_existent_models() {
        let mm = ModelManager::new(
            PathBuf::from("/tmp/__nonexistent_models_dir__"),
            "chat-model-1.gguf",
            "rag-model-1.gguf",
        );
        assert!(!mm.llm_exists());
        assert!(!mm.embedding_exists());
    }

    #[test]
    fn test_recommended_threads_at_least_one() {
        // CpuProfile::detect() applies the memory-bandwidth cap (correct path).
        // ModelManager::recommended_threads() was removed — it returned logical-1
        // which is far too many for DRAM-bound LLM inference on small models.
        let profile = crate::cpu_profile::CpuProfile::detect();
        assert!(profile.recommended_threads >= 1);
    }

    #[test]
    fn test_available_ram_mb_positive() {
        // Any reasonable machine will have at least 1 MiB free.
        assert!(ModelManager::available_ram_mb() > 0);
    }
}
