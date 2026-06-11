---
name: tauri-local-llm
description: "Rust + Tauri 2 + Svelte desktop app with local LLM inference (llama.cpp) and RAG. Use when: building cross-platform desktop apps (Windows, Ubuntu, Raspberry Pi, ARM64); implementing CPU-only local LLM chat or RAG pipelines; RAM-adaptive inference on constrained hardware; streaming token generation with Tauri IPC; BGE embedding + HNSW vector search; BM25 full-text search; offline-first apps with SQLite; cargo profile optimization for llama-cpp-2 in dev mode; multi-platform NSIS/DEB/APK installer builds."
argument-hint: "Describe the feature or bug (e.g. 'add RAG to course mode', 'RAM pressure on Pi 4')"
---

# Tauri 2 + Local LLM Desktop App

## Stack

| Layer | Tech |
|---|---|
| Frontend | Svelte 4, TypeScript, Vite |
| Desktop shell | Tauri 2 (Rust) |
| Inference | llama-cpp-2 crate (llama.cpp wrapper) |
| Embeddings | BGE-small / BGE-base GGUF via llama-cpp-2 |
| Vector search | HNSW (instant-distance or hnswlib-rs) |
| BM25 search | Custom wiki engine (pre-built markdown index) |
| Persistence | SQLite via rusqlite / storage crate |
| Streaming | tokio mpsc channel + `block_in_place` |
| Config | TOML → build.rs baked constants |
| Telemetry | De-identified, SHA-256 hashed, async queue |

## Platform Support Matrix

| Platform | Arch | Notes |
|---|---|---|
| Windows 10/11 | x86_64 | NSIS installer, WebView2 required |
| Ubuntu 22.04+ | x86_64, aarch64 | DEB bundle, uses system WebKit |
| Raspberry Pi 4/5 | aarch64 | 4 GB RAM minimum, `-j2` compile flag |
| Raspberry Pi 5 | aarch64 | 8 GB RAM, full feature set |
| macOS / iOS | arm64 | Tauri mobile, WKWebView, Swift bridge for CoreML |
| Android | aarch64, armv7 | Tauri mobile, APK build, LiteRT / ggml inference |

### ARM / Embedded Build Notes
- Cross-compile from x86 host: `cargo tauri build --target aarch64-unknown-linux-gnu`
- Reduce `n_ctx` in `build_config.toml` for Pi 4 (2048 max, 1024 safe)
- Use `n_threads = 4` (Pi 4) or `n_threads = 8` (Pi 5) in `CpuProfile::detect()`
- Pi OS requires `libwebkit2gtk-4.1-dev`, `libssl-dev`, `libsoup-3.0-dev`
- Cargo compile: add `CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER=aarch64-linux-gnu-gcc`

---

## Core Architecture Pattern

### AppState (shared mutable state)
```rust
pub struct AppState {
    pub llm: Arc<Mutex<Option<LlmEngine>>>,         // single LLM, one session
    pub embedder: Arc<Mutex<Option<EmbeddingEngine>>>,
    pub session_store: Arc<Mutex<SessionStore>>,     // SQLite
    pub rag_index: Arc<Mutex<RagIndex>>,             // HNSW
    pub wiki_engines: Arc<Mutex<HashMap<String, WikiEngine>>>, // BM25 per course
    pub cancel_flag: Arc<AtomicBool>,
    pub is_inferring: Arc<AtomicBool>,
    pub telemetry_queue: TelemetryQueue,
    pub model_manager: ModelManager,
    pub assets_dir: PathBuf,
}
```

### IPC Command Pattern
Every Tauri command follows:
1. Accept `State<'_, AppState>` + typed request struct
2. Return `Result<T, String>` (never panic, always stringify errors)
3. Async for I/O-bound (SQLite, file ops); use `block_in_place` for CPU-bound LLM

---

## Local LLM Chat Streaming

### Step-by-step implementation

**1. Channel setup**
```rust
let (token_tx, mut token_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
let llm_arc = state.llm.clone();
let cancel_flag_for_inference = cancel_flag.clone();
```

**2. Spawn inference task (non-blocking async)**
```rust
tokio::task::spawn(async move {
    let mut llm_guard = llm_arc.lock().await;
    if let Some(llm) = llm_guard.as_mut() {
        tokio::task::block_in_place(|| {
            if let Err(e) = llm.generate_stream(&messages, &params, token_tx.clone(), Some(cancel_flag.clone())) {
                let _ = token_tx.send(format!("⚠️ Inference error: {e}"));
            }
            let _ = token_tx.send("\x00".to_string()); // done sentinel
        });
    } else {
        let _ = token_tx.send("⚠️ No model loaded.".to_string());
        let _ = token_tx.send("\x00".to_string());
    }
});
```
> **Why `block_in_place`?** `spawn_blocking` can't hold non-`Send` Mutex guards. `block_in_place` keeps the worker thread alive for the Tokio runtime while running the blocking llama.cpp call.

**3. Forward tokens to frontend**
```rust
while let Some(token) = token_rx.recv().await {
    if cancel_flag.load(Ordering::SeqCst) { /* send done, break */ }
    if token == "\x00" { /* send done event, break */ }
    channel.send(TokenEvent { token, done: false }).ok();
}
```

**4. Done sentinel contract**
- LLM engine always sends `"\x00"` after last token (even on error)
- Frontend unblocks on `done: true` TokenEvent
- Never drop the channel before sending `"\x00"`

### GenerationParams (RAM-adaptive)
```rust
let max_tokens = runtime_tuning::adaptive_max_tokens_from_ram(llm_ctx, ram);
let params = GenerationParams {
    max_tokens,
    temperature: 0.7,
    top_p: 0.9,
    repeat_penalty: 1.1,
    system_prompt: None,        // embed in messages instead
    no_think: build_config::LLM_NO_THINK,
};
```

---

## RAM-Adaptive Inference (runtime_tuning.rs)

Tuning knobs that scale **down** from TOML defaults at runtime when free RAM is low.

| Function | Purpose | Range |
|---|---|---|
| `history_pairs_budget_from_ram(ram)` | Max Q/A pairs in prompt | 1–2 |
| `context_char_budget_from_ram(ram, n_ctx)` | Max chars for RAG context | 700–7000 |
| `adaptive_max_tokens_from_ram(n_ctx, ram)` | Max generated tokens | 128–256 |
| `adaptive_rag_top_k_from_ram(top_k, ram)` | HNSW search k | 1–configured |
| `truncate_context(ctx, budget)` | Hard-trim context string | — |

### RAM Pressure Scale
```rust
fn pressure_scale(snapshot: RamSnapshot) -> f32 {
    // 0.0 = severe (<8% free), 1.0 = relaxed (>40% free)
    ((snapshot.free_ratio() - 0.08) / 0.32).clamp(0.0, 1.0)
}
```

### Key Thresholds (Pi 4 / 4 GB RAM)
- `< 1024 MB` free → minimum everything (1 pair, 700 chars, 128 tokens)
- `< 1800 MB` free → tight budget
- `< 2560 MB` free → moderate reduction

---

## RAG Pipeline

### Document Upload → Index
1. Parse PDF/DOCX → text chunks (512 tokens, 64 overlap)
2. Embed each chunk via `EmbeddingEngine::embed()` (BGE model)
3. Insert into HNSW index: `rag_index.insert(chunk, embedding)`
4. Store chunk metadata in SQLite (`doc_id`, `page_number`, `text`)

### Query Time
```rust
// 1. Embed query
let query_vec = embedder.embed(query)?;

// 2. HNSW search
let results = rag_index.search(&query_vec, top_k * 3)?;

// 3. Filter by score + selected docs
let filtered: Vec<_> = results.iter()
    .filter(|r| r.score >= 0.25)   // cosine similarity threshold
    .filter(|r| selected_ids.contains(&r.chunk.doc_id))
    .take(top_k)
    .collect();

// 4. Build context string
let context = "Relevant document excerpts:\n\n" + formatted_chunks;
```

### BM25 Course Search
```rust
let engine = WikiEngine::new(&wiki_dir)?;   // loads pre-built index
let results = engine.search(query, top_k)?; // instant, no network
```
BM25 index is pre-built at course generation time and bundled in `assets/courses/{id}/wiki/`.

---

## Config-Driven Model Slots

File names are **permanent** — never renumber (students have existing installations).

| Slot | File | Model |
|---|---|---|
| `chat-model-1.gguf` | Primary LLM (Phi-4-mini ~2.4 GB) |
| `chat-model-2.gguf` | High-quality MoE (Gemma 4 E4B ~5.1 GB) |
| `chat-model-3.gguf` | Strong instruction (Qwen2.5-4B ~2.7 GB) |
| `rag-model-1.gguf` | BGE-small embeddings (35 MB) |
| `rag-model-2.gguf` | BGE-base embeddings (210 MB) |

Change models: edit `src-tauri/models.toml` and rebuild. No code changes.

---

## Cargo Profile Optimization (Critical for Dev Mode)

Without this, llama.cpp runs 20–50× slower in `cargo tauri dev`:

```toml
# Cargo.toml workspace root
[profile.dev.package.llama-cpp-2]
opt-level = 3

[profile.dev.package.inference]
opt-level = 3
```

On ARM / low-core machines also add:
```toml
[profile.release]
codegen-units = 1     # better optimization, slower compile
lto = "thin"          # good for release, skip for dev
```

---

## Build Commands

```powershell
# Windows — net installer (~43 MB, LLM downloads on first launch)
.\scripts\build-all-windows.ps1

# Windows — offline installer (~2.5 GB, LLM bundled)
cargo tauri build --config src-tauri/tauri-withmodel.conf.json

# Ubuntu — DEB package
cargo tauri build --target x86_64-unknown-linux-gnu

# ARM64 (cross-compile from x86 Ubuntu)
cargo tauri build --target aarch64-unknown-linux-gnu

# Dev (hot-reload, inference crates stay optimized)
cargo tauri dev
```

---

## iOS Build (Tauri Mobile)

### Prerequisites
- macOS host with Xcode 15+
- `rustup target add aarch64-apple-ios`
- Tauri mobile plugin: `bun add @tauri-apps/plugin-shell`

### Setup
```bash
cargo tauri ios init        # generates Xcode project in src-tauri/gen/apple
cargo tauri ios dev         # run on simulator
cargo tauri ios build       # produce .ipa
```

### Inference on iOS
- Primary: **CoreML** via llama.cpp CoreML backend (`-DGGML_METAL=OFF -DGGML_COREML=ON`)
- Fallback: CPU GGUF inference (slower but universal)
- Quantization: Q4_K_M fits in 3 GB app memory budget
- Model delivery: bundle small model (<1 GB) or download on first launch via `URLSession`

### Tauri iOS Gotchas
- WKWebView enforces CSP — no `eval`, no inline scripts
- File system access via `tauri::api::path` only (no absolute paths)
- IPC uses `window.__TAURI_IPC__` bridge (same as desktop, no changes needed)
- Background tasks limited: do inference in foreground only
- Entitlements needed: `com.apple.security.network.client` for model download

---

## Android Build (Tauri Mobile)

### Prerequisites
- Android Studio + NDK r26+
- `rustup target add aarch64-linux-android armv7-linux-androideabi`
- Set `ANDROID_HOME` and `NDK_HOME` env vars

### Setup
```bash
cargo tauri android init      # generates Android project in src-tauri/gen/android
cargo tauri android dev       # run on emulator / device
cargo tauri android build     # produce .apk / .aab
```

### Inference on Android
- Use **LiteRT** (formerly TensorFlow Lite) or llama.cpp JNI bridge
- llama.cpp Android: build shared lib with CMake + Android NDK
```cmake
# CMakeLists.txt snippet
add_library(llama SHARED ${LLAMA_SOURCES})
target_compile_options(llama PRIVATE -O3 -march=armv8-a+dotprod)
```
- Load from Rust via `libloading` or direct `unsafe extern "C"` FFI
- GGUF models: place in `assets/` or download to `getExternalFilesDir()`

### Android RAM Constraints
| Device RAM | Recommended model | Max n_ctx |
|---|---|---|
| 4 GB | Q2_K (~1 GB) | 512 |
| 6 GB | Q4_K_M (~2.4 GB) | 1024 |
| 8 GB+ | Q4_K_M or Q5_K_M | 2048 |

### Android Gotchas
- Main thread blocked by inference → use `Dispatchers.IO` coroutine (Kotlin side) or `block_in_place` (Rust Tokio side)
- APK size limit (Play Store): 150 MB → use Play Asset Delivery for model files
- `minSdkVersion 24` (Android 7.0) for Tauri mobile
- WebView is Chrome-based — same CSP restrictions as iOS

### Preflight Checks Before Build
1. `cd frontend && bun run check` — Svelte type check (0 errors required)
2. `cargo check --release -p student-ai` — Rust release check
3. Validate course manifests: `python3 scripts/verify-release-matrix.py`

---

## Tauri IPC: System Stats with sysinfo 0.30

```rust
// sysinfo 0.30 API — use this, not older API
use sysinfo::{Pid, ProcessRefreshKind, RefreshKind, System};

pub fn app_process_stats() -> (u64, f32) {
    let pid = Pid::from_u32(std::process::id());
    let kind = ProcessRefreshKind::new().with_memory().with_cpu();
    let mut sys = System::new_with_specifics(RefreshKind::new().with_processes(kind));
    sys.refresh_process_specifics(pid, kind);
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL); // required for accurate CPU delta
    sys.refresh_process_specifics(pid, kind);
    sys.process(pid)
        .map(|p| (p.memory() / (1024 * 1024), p.cpu_usage()))
        .unwrap_or((0, 0.0))
}
```
> ⚠️ `ProcessRefreshKind::with_tasks()` does NOT exist in sysinfo 0.30. Do not use it.

---

## Svelte Frontend Patterns

### Tauri IPC call wrapper
```typescript
// frontend/src/lib/tauri.ts
import { invoke } from '@tauri-apps/api/core';

export async function getSystemStats(): Promise<SystemStats> {
  if (import.meta.env.DEV) {
    return { available_ram_mb: 4096, total_ram_mb: 8192, cpu_threads: 8,
             app_ram_mb: 512, app_cpu_pct: 2.5 };
  }
  return invoke<SystemStats>('get_system_stats');
}
```

### Token streaming subscription
```typescript
const channel = new Channel<TokenEvent>();
channel.onmessage = (event) => {
  if (event.done) { finalize(); return; }
  buffer += event.token;
  if (Date.now() - lastRender > 30) { // 30ms batch
    displayText = buffer;
    lastRender = Date.now();
  }
};
await invoke('chat_stream', { request, channel });
```

### Dev-mode mock pattern
Always provide mock returns in `import.meta.env.DEV` blocks so the frontend is testable without a running Tauri backend.

---

## Testing Workflow

```powershell
# After building + installing:
cd tests/desktop-e2e
bunx playwright test --project=smoke --project=general-chat --project=rag-documents --project=course-chat

# Expected: 35 passed
```

### Test Projects
| Project | What it tests |
|---|---|
| `smoke` | App launches, main UI visible |
| `general-chat` | LLM responds, streaming works |
| `rag-documents` | PDF upload → indexed → answers with citations |
| `course-chat` | BM25 course search returns relevant content |

---

## Common Issues & Fixes

| Symptom | Cause | Fix |
|---|---|---|
| Inference 20–50× slow in dev | llama-cpp-2 compiled unoptimized | Add `opt-level = 3` profile override |
| `with_tasks()` compile error | sysinfo 0.30 API removed it | Use `ProcessRefreshKind::new().with_memory().with_cpu()` only |
| Frontend won't connect in dev | Tauri not running | Run `cargo tauri dev`, not `bun run dev` standalone |
| OOM on Pi 4 during inference | `n_ctx` too large | Set `n_ctx = 1024` in `build_config.toml` |
| HNSW search returns 0 results | Embedding model not loaded | Check `rag-model-1.gguf` exists at `model_manager.embedding_model_path()` |
| ARM64 link error | Wrong linker | Set `CARGO_TARGET_AARCH64_UNKNOWN_LINUX_GNU_LINKER` env var |
| WebView2 missing on Windows | Not installed | App auto-installs via `PrereqCheck.svelte` on first launch |

---

## Security Checklist

- [ ] No model URLs or server credentials in frontend code
- [ ] Model download errors sanitized (no URL leakage in user-visible messages)
- [ ] Telemetry: user content never transmitted verbatim — PII-cleaned + SHA-256 hashed
- [ ] SQLite: parameterized queries only (no string interpolation)
- [ ] Tauri `allowlist`: minimal IPC surface — only declared commands exposed
- [ ] File paths from frontend validated against allowed directories only
