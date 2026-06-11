pub mod session;
pub mod embedding;
pub mod model_manager;
pub mod cpu_profile;

pub use session::{LlmEngine, GenerationParams, ChatMessage};
pub use embedding::EmbeddingEngine;
pub use model_manager::ModelManager;
pub use cpu_profile::CpuProfile;

// ---------------------------------------------------------------------------
// GPU layer count — single source of truth
// ---------------------------------------------------------------------------
// CPU builds:  GPU_LAYERS = 0   (pure CPU, no Vulkan code compiled in)
// GPU builds:  GPU_LAYERS = 99  (offloads all layers; llama.cpp caps at model max)
//
// `vulkan` feature is ONLY set by the build scripts for gpu/gpu-withmodel variants.
// It must never appear in cpu/cpu-withmodel build commands.
#[cfg(feature = "vulkan")]
pub const GPU_LAYERS: u32 = 99;

#[cfg(not(feature = "vulkan"))]
pub const GPU_LAYERS: u32 = 0;

// ---------------------------------------------------------------------------
// Process-global llama.cpp backend
// ---------------------------------------------------------------------------
// `LlamaBackend::init()` wraps a C++ global singleton; calling it twice while
// a previous instance is still live returns `BackendAlreadyInitialized`.
// We therefore initialise it exactly once per process and hand out a `&'static`
// reference to any code that needs it.

use once_cell::sync::OnceCell;
use llama_cpp_2::llama_backend::LlamaBackend;

static LLAMA_BACKEND: OnceCell<LlamaBackend> = OnceCell::new();

/// Return a reference to the process-global `LlamaBackend`, initialising it on
/// the first call.  Subsequent calls reuse the existing instance.
pub fn llama_backend() -> anyhow::Result<&'static LlamaBackend> {
    LLAMA_BACKEND
        .get_or_try_init(LlamaBackend::init)
        .map_err(|e| anyhow::anyhow!("Failed to initialise llama backend: {e}"))
}

