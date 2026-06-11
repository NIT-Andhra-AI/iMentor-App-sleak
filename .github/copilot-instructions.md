# Copilot Instructions for Student AI

## Project Overview
Student AI is a Tauri 2 desktop application for BTech students that enables local LLM chat with CPU-only inference (no GPU, no cloud). The stack combines Rust (backend + Tauri) with Svelte 4 frontend, llama.cpp2 for inference, and SQLite for persistence. The app runs on 8GB RAM student laptops and supports offline-first operation with optional model bundling.

## Build, Test, and Lint Commands

### Frontend (Svelte + TypeScript)
```bash
# Check TypeScript + Svelte
cd frontend && bun run check

# Build for production
bun run build

# Local dev server (Vite)
bun run dev
```

### Tauri App (Rust backend + full application)
```bash
# Development mode (hot-reload Svelte, debug Rust)
cargo tauri dev

# Production build — net installer (~43 MB, LLM downloaded on first launch)
cargo tauri build --target x86_64-pc-windows-msvc

# Production build — offline installer (~2.5 GB, LLM bundled, requires bundled_model\Phi-4-mini-instruct-Q4_K_M.gguf)
cargo tauri build --target x86_64-pc-windows-msvc --config src-tauri/tauri-withmodel.conf.json

# Build both variants at once (recommended)
.\scripts\build-all-windows.ps1
```

### Rust Workspace (multiple crates)
```bash
# Build all default crates (app + core libraries)
cargo build

# Build specific crate
cargo build -p inference

# Build benchmark tool (explicit — not in default-members)
cargo build -p model-bench
cargo build -p chatbot-test

# Run tests for a single crate
cargo test -p wiki
```

### Setup and Verification
```bash
# One-shot dev environment setup (Windows, elevated PowerShell)
.\scripts\dev-setup.ps1

# Check system prerequisites (WebView2, VC++ runtime, etc.)
# Run via the PrereqCheck.svelte component on first launch
```

## High-Level Architecture

### Three-Tier System
1. **Frontend** (`frontend/`): Svelte 4 UI with reactive stores. Manages chat UI, mode switching (General/Course/UserDocs), message streaming with 30ms token batching.
2. **Tauri Runtime** (`src-tauri/`): Rust backend exposing IPC commands (chat, model download, document upload, course search). Orchestrates inference, RAG, persistence.
3. **Inference Engine** (`crates/inference/`): llama.cpp2 wrapper. Manages LLM + embedding model lifecycle, streaming token output, context window limits.

### Core Crates (Rust Workspace)
- **inference**: LLM engine (llama-cpp-2 wrapper), embedding model for RAG search
- **wiki**: BM25 full-text search over bundled course markdown (fast, zero-network)
- **rag**: Document upload → chunking → HNSW vector indexing + retrieval
- **storage**: SQLite abstraction (chat sessions, messages, documents, user settings)
- **telemetry**: Privacy-first analytics (de-identification, optional server upload)
- **agents**: Multi-agent orchestration framework (for future expansion)
- **model-bench**: Benchmark harness (100-question BTech evaluation)
- **chatbot-test**: Integration test runner

### Config-Driven System
All model and deployment settings are **compile-time constants** — no hardcoded values:
- **`src-tauri/models.toml`**: Model URLs, file names (e.g., chat-model-1.gguf), display names. Edit to switch models or add new ones.
- **`src-tauri/build_config.toml`**: Deployment knobs (context window, RAG chunk size, server URL, expiry date, auto-uninstall rules). Baked into binary via `build.rs`.
- **Multi-model configs**: `models-gemma-e2b.toml`, `models-qwen3.toml` for variant builds.

**Key principle**: No code changes needed to switch models or adjust inference parameters — update TOML, rebuild.

### Build Variants
Two NSIS installer variants, both produced by `scripts/build-all-windows.ps1`:

- **Net installer** (`tauri.conf.json`): App + BGE embedding model (35 MB) + courses bundled (~43 MB total). LLM handled in order: (1) copy `llm.gguf` sidecar if placed alongside setup.exe during NSIS install, (2) download from internet on first launch, (3) if no internet → show "Connect to internet or use the Offline Installer". Output: `dist/windows/StudentAI-net-setup-x86_64.exe`.

- **Offline installer** (`tauri-withmodel.conf.json` overlay): All of the above **plus** the LLM model bundled inside the exe (~2.5 GB). Zero downloads, works air-gapped. Requires `bundled_model/Phi-4-mini-instruct-Q4_K_M.gguf` at build time. Output: `dist/windows/StudentAI-offline-setup-x86_64.exe`.

### Model Slot Contract (PERMANENT)
File names are permanent across all models to prevent conflicts on student machines:
- `chat-model-1.gguf` → Phi-4-mini (default, ~2.4 GB)
- `chat-model-2.gguf` → Gemma 4 E4B (~5.1 GB, high quality MoE)
- `chat-model-3.gguf` → Qwen2.5-4B (~2.7 GB, strong instruction-following)
- `chat-model-4.gguf` → Gemma 4 E2B (~2.9 GB, fits 10 GB RAM MoE variant)
- `chat-model-5.gguf` → Qwen3-4B (~2.5 GB, DEFAULT — built-in thinking mode, best BTech quality for 8 GB laptops)
- `rag-model-1.gguf` → BGE-small (default, 35 MB)
- `rag-model-2.gguf` → BGE-base (higher quality, 210 MB)

**Never renumber these slots** — students' machines rely on consistent file names.

### Course Content
Courses are pre-built markdown wikis bundled in `assets/courses/{course-id}/`:
- BM25 search enables instant full-text lookup without network
- Admin-only: Generate new courses via `tools/course_gen/` (Python + course PDFs)

## Key Conventions

### Tauri IPC Commands
All backend functionality exposed via commands in `src-tauri/src/commands/`:
- `chat.rs`: Streaming LLM inference (token batching via channels)
- `documents.rs`: PDF/DOCX upload → RAG indexing
- `courses.rs`: Course metadata + wiki full-text search
- `model_download.rs`: Streaming GGUF download with progress (sanitized error messages)
- `agents.rs`: Multi-agent orchestration entry points
- `settings.rs`: User preferences persistence
- Each command receives `AppState` for shared access to inference engine, DB, models

### AppState Architecture
`src-tauri/src/state.rs` defines the shared application state:
- Single `LlmEngine` + `EmbeddingEngine` per session (one-shot initialization in `setup.rs`)
- SQLite connection pool for concurrent access
- Telemetry queue for async upload
- All mutations are thread-safe (Arc + Mutex/RwLock)

### Frontend State Management
Svelte 5-style stores in `frontend/src/stores/`:
- `chatStore.ts`: Current session messages, mode (General/Course/UserDocs), streaming state
- `modeStore.ts`: Active chat mode + mode-specific parameters
- Reactive subscribers handle UI updates (no manual re-renders)

### Streaming and Token Batching
- LLM inference streams tokens via Tokio channel to frontend
- Frontend batches tokens for 30ms before rendering (smooth UX, fewer DOM updates)
- Chat messages render as plain text during streaming, markdown only when complete
- Context window (`n_ctx` in `build_config.toml`) is compile-time constant to avoid OOM surprises

### Error Handling & Privacy
- Model download errors are sanitized (no URL leaks, no credential exposure)
- Telemetry failures are silent (never blocks main app)
- Missing course files gracefully degrade to General mode
- SQLite transaction failures are logged and retried
- Chat content is never included in telemetry (de-identified metrics only)

### Deployment Security
- Model names use randomized files on student machines to prevent user tampering
- Optional expiry + auto-uninstall (configurable via `build_config.toml`)
- App requires no admin privileges (WiX MSI installer handles deps, app runs as user)
- License check happens on startup (configurable max_install_days + inactivity_days)

### Development Performance
Tauri dev mode compiles in debug by default, making llama.cpp inference 20–50× slower. Cargo.toml has profile overrides to keep inference crates optimized:
```toml
[profile.dev.package.llama-cpp-2]
opt-level = 3

[profile.dev.package.inference]
opt-level = 3
```
This enables fast inference during `cargo tauri dev` while keeping the rest of the codebase in incremental debug mode.

### Python Admin Tools
Two-terminal setup for course generation (admin only):
```bash
# Terminal 1 (wiki generation server)
source admin-venv/bin/activate
tools/course_gen/start-server.sh

# Terminal 2 (request new course generation)
python tools/course_gen/generate_wiki.py machine-learning
```
Outputs to `assets/courses/machine-learning/wiki/` — then commit and rebuild the app.

### Prerequisites & Setup
- **Windows**: VS Build Tools 2022, LLVM 14+, Rust 1.80+, Bun (latest), Python 3.11+
- **Ubuntu**: Same as Windows, plus build-essential
- Auto-setup: `.\scripts\dev-setup.ps1` (Windows) or `bash scripts/dev-setup.sh` (Ubuntu)

### Build Guides
- **Windows MSI**: See `docs/setup-windows.md` (net-download and bundled-model variants)
- **Ubuntu DEB**: See `docs/setup-ubuntu.md`
- **Android APK**: See `docs/build-android.md` (LiteRT inference, planned)

## Notes

- **Single Code Base**: No `#[cfg(...)]` branching between dev and production — all knobs in TOML.
- **No CI/CD**: Builds are manual, local-only (no GitHub Actions). MSI generation uses WiX; DEB uses Tauri's bundler.
- **WebView2 Requirement**: Windows users need WebView2 runtime; auto-installed on first run via `PrereqCheck.svelte`.
- **GPU Support**: Vulkan offload available via `--features vulkan`, but primary target is CPU-only.
- **Third-party Models**: Sourced from HuggingFace (Unsloth, ggml-org, Bartowski). Update URLs in `models.toml` if sources change.
- **Course Manifest**: Each course has a `manifest.json` describing topics and learning objectives (supports mode-specific filtering).
- **Runtime Direction**: Keep the app strict Tauri-only for runtime features (chat, agents, documents, course interactions). Do not introduce browser API fallbacks or Ollama-based generation paths in `server/api/routes/*`.
