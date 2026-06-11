# Student AI — Ubuntu Development Environment Setup

> **Environment policy**
> - **Development + DEB build**: Ubuntu 24.04 LTS (x86_64)
> - **Windows MSI build**: Windows machine (see `docs/setup-windows.md`)
> - **Android APK build**: Ubuntu 24.04 recommended (see `docs/build-android.md`)
>
> All day-to-day coding, testing, `cargo tauri dev`, and `.deb` installer builds
> run on Ubuntu. The Windows MSI is produced on a Windows machine.

---

## 1. System Requirements

| Item | Minimum | Recommended |
|------|---------|-------------|
| OS | Ubuntu 22.04 LTS | Ubuntu 24.04 LTS |
| RAM | 8 GB | 16 GB (model runs in RAM) |
| Disk | 10 GB free | 20 GB free |
| CPU | x86_64, 4 cores | 8+ cores (faster inference) |

---

## 2. System Packages

Install all C/C++ build tools, GTK/WebKit headers (required by Tauri), and
Clang (required by `llama-cpp-2` for bindgen):

```bash
sudo apt-get update
sudo apt-get install -y \
  build-essential \
  cmake \
  clang \
  libclang-dev \
  pkg-config \
  libssl-dev \
  libgtk-3-dev \
  libwebkit2gtk-4.1-dev \
  libsoup-3.0-dev \
  librsvg2-dev \
  patchelf \
  curl \
  wget \
  git
```

**Why each package is needed:**

| Package | Required by |
|---------|-------------|
| `build-essential`, `cmake` | `llama-cpp-2` builds llama.cpp C++ from source |
| `clang`, `libclang-dev` | `llama-cpp-2` bindgen code generation for `stdbool.h` etc. |
| `pkg-config` | Rust build scripts locate system libraries |
| `libssl-dev` | `reqwest` (GGUF model downloads over HTTPS) |
| `libgtk-3-dev` | Tauri window manager backend |
| `libwebkit2gtk-4.1-dev` | Tauri WebView renderer |
| `libsoup-3.0-dev` | HTTP stack used by WebKit |
| `librsvg2-dev` | Tauri app icon rendering |
| `patchelf` | Tauri Linux bundler (AppImage / deb patching) |
| `curl` / `wget` | `scripts/download-models.sh` |

---

## 3. Rust Toolchain

### 3a. Install rustup (if not already installed)

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Choose option 1 (default install)
source "$HOME/.cargo/env"
```

### 3b. Ensure stable toolchain and Linux target

```bash
rustup default stable
rustup update
rustup target add x86_64-unknown-linux-gnu   # native Linux target
```

Verify:

```bash
rustc --version    # rustc 1.94.1 or newer
cargo --version
```

### 3c. Install Tauri CLI

```bash
cargo install tauri-cli --version "^2" --locked
```

Verify:

```bash
cargo tauri --version   # should print: tauri-cli 2.x.x
```

> **Note:** `cargo install` may take 5–10 minutes the first time.

---

## 4. Bun

Install Bun:

```bash
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
```

Verify:

```bash
bun --version
```

---

## 5. Clone & Install Frontend Dependencies

```bash
git clone <your-repo-url> student-ai
cd student-ai/frontend
bun install --frozen-lockfile
```

This installs everything in `frontend/package.json` including:
- `@tauri-apps/cli ^2`
- `@tauri-apps/api ^2`
- Svelte 4, Vite 5, TypeScript 5

---

## 6. Download AI Models (one-time)

The app requires two GGUF models at first launch. Download them to the Tauri
app-data directory so `cargo tauri dev` finds them automatically:

```bash
bash scripts/download-models.sh
```

This downloads:

| Model | File | Size |
|-------|------|------|
| Phi-4-mini Q4_K_M (LLM) | `phi-4-mini-q4_k_m.gguf` | ~2.4 GB |
| BGE-small-en-v1.5 Q8_0 (Embeddings) | `bge-small-en-v1.5-q8_0.gguf` | ~33 MB |

Models are saved to:

```
~/.local/share/com.studentai.app/models/
```

> Re-running the script is safe — it skips files already present.
>
> To download to a custom path:
> ```bash
> bash scripts/download-models.sh --dir /path/to/models
> ```

---

## 7. Environment Variable (Clang for llama-cpp-2)

`llama-cpp-2` uses `bindgen` which requires Clang's system headers. Export
this before building so `stdbool.h` is found:

```bash
export BINDGEN_EXTRA_CLANG_ARGS="-I/usr/lib/gcc/x86_64-linux-gnu/13/include"
```

Add it to your shell profile so it persists across sessions:

```bash
echo 'export BINDGEN_EXTRA_CLANG_ARGS="-I/usr/lib/gcc/x86_64-linux-gnu/13/include"' \
  >> ~/.bashrc
source ~/.bashrc
```

> If you are on Ubuntu 22.04 with GCC 11 instead of 13, adjust the path:
> ```bash
> export BINDGEN_EXTRA_CLANG_ARGS="-I/usr/lib/gcc/x86_64-linux-gnu/11/include"
> ```

---

## 8. Running the App in Development Mode

### Full Tauri dev (frontend + backend together):

```bash
cd student-ai
./scripts/dev-tauri.sh

# Optional: skip manifest validation for quick local iteration
./scripts/dev-tauri.sh --skip-manifest-check
```

This starts:
- Vite dev server on `http://localhost:5173`
- Tauri shell with live-reload on Rust changes

### Frontend only (no Rust/LLM):

```bash
cd student-ai/frontend
bun run dev
# Open http://127.0.0.1:5173
```

### Run all tests:

```bash
# All workspace crates (no Tauri, pure Rust)
cargo test --workspace

# Specific test crate (comprehensive chatbot pipeline tests)
cargo test -p chatbot-test

# Single crate
cargo test -p inference
cargo test -p wiki
cargo test -p rag
cargo test -p storage
cargo test -p telemetry
cargo test -p agents
```

---

## 8c. Building the Linux DEB Installer

Produces a Debian/Ubuntu `.deb` package for distribution on Linux desktops.

### Prerequisites (same as development setup above)

All system packages, Rust, and Tauri CLI must already be installed.

### Build

```bash
cd frontend && bun install --frozen-lockfile && cd ..
cargo tauri build

# Scripted bundle build (includes release preflight + manifest validation)
./scripts/build-all-linux.sh --target x86_64-unknown-linux-gnu

# Optional: skip manifest validation for quick local iteration
./scripts/build-all-linux.sh --target x86_64-unknown-linux-gnu --skip-manifest-check
```

> Tauri will only build targets appropriate for the current platform.
> On Ubuntu it produces a `.deb` (and optionally AppImage).
> The `msi` target in `tauri.conf.json` is silently ignored on Linux.

Output:
```
src-tauri/target/release/bundle/deb/student-ai_*.deb
```

### Install locally for testing
```bash
sudo dpkg -i src-tauri/target/release/bundle/deb/student-ai_*.deb
# Launch:
student-ai
```

### Uninstall
```bash
sudo dpkg -r student-ai
```

---



Runs 100 BTech questions (10 per subject × 10 subjects) through each model and records
TTFT (first token latency), throughput (tok/s), and keyword-based quality scores.
For Qwen3/3.5 models, also runs 20 representative questions in **thinking mode** (`/think`)
and separately tracks `think_tokens`, time to think-block end, and first answer token latency.

**Prerequisites:** Download the 3 benchmark models first (~7 GB total):

```bash
# Phi-4-mini (~2.4 GB)
curl -L "https://huggingface.co/unsloth/Phi-4-mini-Instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf" \
  -o ~/.local/share/com.studentai.app/models/phi-4-mini-q4_k_m.gguf

# Gemma-4-E4B (~5.0 GB)
curl -L "https://huggingface.co/unsloth/gemma-4-e4b-GGUF/resolve/main/gemma-4-e4b-it-Q4_K_M.gguf" \
  -o ~/.local/share/com.studentai.app/models/gemma-4-e4b-q4_k_m.gguf

# Qwen3.5-4B (~2.7 GB)  ← thinking model, runs thinking + standard passes
curl -L "https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/Qwen3.5-4B-Q4_K_M.gguf" \
  -o ~/.local/share/com.studentai.app/models/qwen3.5-4b-q4_k_m.gguf
```

**Build and run:**

```bash
# Build the benchmark binary (release mode for realistic performance numbers)
BINDGEN_EXTRA_CLANG_ARGS="-I/usr/lib/gcc/x86_64-linux-gnu/13/include" \
  cargo build --release -p model-bench

# Run — outputs to bench-results/
# Runtime estimate: ~2.5-3 hr on Intel Core Ultra 7 155H (CPU-only, 4 threads)
RUST_LOG=info ./target/release/model-bench
```

Results are written to `bench-results/`:
- `phi_4_mini_standard.json`, `gemma_4_e4b_standard.json`, `qwen3_5_4b_standard.json` — 100q standard
- `qwen3_5_4b_thinking.json` — 20q thinking-mode results
- `combined_v2.json` — all results in one file

**Thinking mode metrics (Qwen3.5-4B):**
- `ttft_ms`: time to very first token (start of `<think>` block)
- `think_end_ms`: time when `</think>` closes (thinking done)
- `answer_ttft_ms`: time to first actual answer token after thinking
- `think_tokens`: token count inside `<think>…</think>`
- `quality_score`: keyword coverage scored against the answer portion only

**Subjects covered:** OS, DBMS, Computer Networks, Data Structures, Algorithms,
Digital Logic, OOP, Compiler Design, Computer Organization, Engineering Mathematics.

---

## 9. Project Structure Reference

```
student-ai/
├── .cargo/config.toml          # Build targets config (Linux default, Windows for prod)
├── Cargo.toml                  # Workspace root
├── frontend/                   # React + Vite + TypeScript UI
│   ├── package.json
│   └── src/
├── src-tauri/                  # Tauri shell (Rust)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs              # App entry, command registration
│       ├── setup.rs            # Init: model loading, DB setup
│       └── commands/           # Tauri IPC commands
├── crates/
│   ├── inference/              # LLM + embedding engines (llama-cpp-2)
│   ├── wiki/                   # BM25 course search (tantivy)
│   ├── rag/                    # PDF/DOCX chunking + HNSW vector store
│   ├── storage/                # SQLite session storage (rusqlite)
│   ├── telemetry/              # PII scrubbing + usage metrics
│   ├── agents/                 # Dev/Test agent orchestrator
│   ├── chatbot-test/           # 44-test integration test suite
│   └── model-bench/            # Multi-model benchmark (100 BTech questions)
├── models/                     # Wiki markdown files for BM25 index
├── scripts/
│   ├── download-models.sh      # Linux/macOS GGUF downloader
│   └── download-models.ps1     # Windows GGUF downloader (for prod machine)
└── ubuntu_dev_instructions.md  # ← this file
```

---

## 10. Troubleshooting

### `stdbool.h` not found during `cargo build`

```
fatal error: 'stdbool.h' file not found
```

**Fix:** Export the clang include path (see Section 7):

```bash
export BINDGEN_EXTRA_CLANG_ARGS="-I/usr/lib/gcc/x86_64-linux-gnu/13/include"
```

---

### `cargo tauri dev` fails with missing GTK/WebKit

```
error: failed to run custom build command for `webkit2gtk-sys`
```

**Fix:** Install the WebKit dev headers (see Section 2):

```bash
sudo apt-get install -y libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev
```

---

### `pkg-config` not found

```
error: could not find system library 'openssl' required by the 'openssl-sys' crate
```

**Fix:**

```bash
sudo apt-get install -y pkg-config libssl-dev
```

---

### Model not found at startup

```
WARN  No LLM model found at ...
```

**Fix:** Run the model downloader:

```bash
bash scripts/download-models.sh
```

Verify files exist:

```bash
ls -lh ~/.local/share/com.studentai.app/models/
# Should show phi-3.5-mini-q4_k_m.gguf (~2.3 GB) and bge-small-en-v1.5-q8_0.gguf (~36 MB)
```

---

### `cargo tauri` command not found

```
error: no such subcommand: `tauri`
```

**Fix:** Install the Tauri CLI:

```bash
cargo install tauri-cli --version "^2" --locked
```

---

## 11. Course Wiki Generation (AI-Powered)

The course generation pipeline adapts the NIT-Andhra-AI/chatbot lecture generator to run
locally with GGUF models via llama-cpp-python.

### Setup

```bash
# Create admin venv (first time only)
python3 -m venv admin-venv --system-site-packages
source admin-venv/bin/activate

# Install Python dependencies
pip install "llama-cpp-python[server]" openai pydantic pdfplumber
```

### Generate Wiki for a Course

```bash
# Terminal 1: Start the LLM server (uses phi-4-mini by default)
tools/start_llm_server.sh

# Terminal 2: Generate wiki pages
source admin-venv/bin/activate
python tools/course_gen/generate_wiki.py machine-learning

# Options:
python tools/course_gen/generate_wiki.py machine-learning --overwrite       # regenerate all pages
python tools/course_gen/generate_wiki.py machine-learning --concepts-only   # skip note generation
```

### What it Does

1. Reads `assets/courses/machine-learning/raw/` (PDFs) + `syllabus.csv`
2. Extracts a knowledge graph (concepts + relationships) using the local LLM
3. Generates a detailed wiki page per concept (definition, intuition, formulas, examples)
4. Writes markdown pages to `assets/courses/machine-learning/wiki/`
5. Updates `manifest.json`

### Pipeline Architecture

```
assets/courses/{id}/raw/*.pdf  ─┐
assets/courses/{id}/syllabus.csv─┤
                                 ▼
                    course_loader.py + syllabus_loader.py
                                 │
                                 ▼
                    concept_extractor.py (knowledge graph via LLM)
                                 │
                                 ▼
                    note_writer.py (per-concept notes via LLM)
                                 │
                                 ▼
                    wiki_writer.py (markdown → assets/courses/{id}/wiki/)
                                 │
                                 ▼
                    crates/wiki WikiLoader (tantivy BM25 index)
```

### Using a Different Model

```bash
# Use Qwen3.5-4B for higher quality notes (slower)
tools/start_llm_server.sh qwen3.5-4b-q4_k_m.gguf
python tools/course_gen/generate_wiki.py machine-learning --overwrite
```

### Time Estimates (CPU, 4 threads)

| Course Size | Concepts | Estimated Time |
|-------------|----------|---------------|
| 10 lectures | ~15 concepts | ~30 min |
| 30 lectures | ~40 concepts | ~90 min |
| Full BTech course | ~60 concepts | ~2.5 hours |

---

## 12. Quick-Start Checklist

Run through this on a fresh Ubuntu 24.04 machine:

```bash
# 1. System packages
sudo apt-get update && sudo apt-get install -y \
  build-essential cmake clang libclang-dev pkg-config libssl-dev \
  libgtk-3-dev libwebkit2gtk-4.1-dev libsoup-3.0-dev librsvg2-dev \
  patchelf curl wget git

# 2. Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup default stable && rustup target add x86_64-unknown-linux-gnu

# 3. Tauri CLI
cargo install tauri-cli --version "^2" --locked

# 4. Bun
curl -fsSL https://bun.sh/install | bash
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"

# 5. Clang env var (persist it)
echo 'export BINDGEN_EXTRA_CLANG_ARGS="-I/usr/lib/gcc/x86_64-linux-gnu/13/include"' >> ~/.bashrc
source ~/.bashrc

# 6. Clone repo and install frontend deps
git clone <your-repo-url> student-ai
cd student-ai/frontend && bun install --frozen-lockfile && cd ..

# 7. Download AI models (~2.4 GB — chat model + embedding model)
bash scripts/download-models.sh

# 7b. (Optional) Download benchmark models (~7 GB — Phi-4-mini, Gemma-3-4B, Qwen3-4B)
MODELS_DIR=~/.local/share/com.studentai.app/models
curl -L "https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf" \
     -o "$MODELS_DIR/phi-4-mini-q4_k_m.gguf"
curl -L "https://huggingface.co/unsloth/gemma-3-4b-it-GGUF/resolve/main/gemma-3-4b-it-Q4_K_M.gguf" \
     -o "$MODELS_DIR/gemma-3-4b-q4_k_m.gguf"
curl -L "https://huggingface.co/unsloth/Qwen3-4B-GGUF/resolve/main/Qwen3-4B-Q4_K_M.gguf" \
     -o "$MODELS_DIR/qwen3-4b-q4_k_m.gguf"

# 8. Run in dev mode
./scripts/dev-tauri.sh

# 9. (Optional) Set up course generation tools
python3 -m venv admin-venv --system-site-packages
source admin-venv/bin/activate
pip install "llama-cpp-python[server]" openai pydantic pdfplumber
```
