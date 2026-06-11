# Student AI

A Tauri 2 desktop app that lets BTech students chat with a local LLM on non-GPU 8 GB RAM laptops, using Rust + llama.cpp2 for CPU inference with no cloud dependency.

## Core Product Direction (Non-Negotiable)

- Two apps in one repository:
- Student App: Tauri runtime for chat, course query, RAG docs, and agents.
- Admin App: FastAPI + dashboard for course updates and de-identified telemetry.
- Student runtime features are strict Tauri command flows. Do not add browser-runtime fallback paths for chat, documents, courses, or agents.
- Primary stack is Rust + Tauri + Svelte + llama.cpp. Evaluate alternative UI frameworks only as future experiments, not as active migration tracks.

---

## Quick start

### Prerequisites

| Tool | Minimum version |
|------|----------------|
| Rust (stable-msvc on Windows) | 1.80+ |
| Bun | latest |
| LLVM | 14+ (needed for `bindgen` / `libclang`) |
| Python | 3.11+ (course generation only) |

#### Automated setup

```bash
# Ubuntu / Linux
bash scripts/dev-setup.sh

# Windows (elevated PowerShell)
.\scripts\dev-setup.ps1
```

---

## Project layout

```
app/
├── assets/               # Bundled courses, icons, EULA
│   └── courses/          # {course-id}/wiki/*.md + raw/
├── crates/               # Rust workspace crates
│   ├── inference/        # llama-cpp2 wrapper + GGUF inference (desktop)
│   ├── telemetry/        # Endpoint resolver, anonymous usage
│   └── ...
├── docs/                 # Architecture, build guides, benchmarks
│   ├── setup-windows.md  # Windows MSI build (net-download + with-model)
│   ├── setup-ubuntu.md   # Ubuntu dev env + DEB build
│   └── build-android.md  # Android APK build (LiteRT, planned)
├── frontend/             # Svelte + TypeScript UI (Vite)
├── scripts/              # Dev setup + model download helpers
├── server/               # FastAPI admin server + dashboard
├── src-tauri/            # Tauri 2 app core (Rust)
│   ├── build_config.toml # ← fill in server_url before building
│   ├── tauri.conf.json   # Bundle targets: msi (Windows), deb (Linux)
│   ├── tauri-withmodel.conf.json  # Extra config for bundled-model MSI
│   └── src/
└── tools/
    └── course_gen/       # AI-powered course wiki generator
```

---

## Building

| Platform | Output | Guide |
|----------|--------|-------|
| **Windows** | `StudentAI-netdownload-x64.msi` (model downloads on first run) | [`docs/setup-windows.md`](docs/setup-windows.md) |
| **Windows** | `StudentAI-withmodel-x64.msi` (model bundled, ~2.5 GB) | [`docs/setup-windows.md`](docs/setup-windows.md) |
| **Ubuntu** | `student-ai_*.deb` | [`docs/setup-ubuntu.md`](docs/setup-ubuntu.md) |
| **Android** | `StudentAI.apk` (LiteRT inference, planned) | [`docs/build-android.md`](docs/build-android.md) |

### Quick build commands

```powershell
# Windows — net-download MSI
cargo tauri build --target x86_64-pc-windows-msvc

# Windows — with bundled model (download model first, see setup-windows.md)
cargo tauri build --target x86_64-pc-windows-msvc --config src-tauri/tauri-withmodel.conf.json
```

```bash
# Ubuntu — DEB
cargo tauri build

# Ubuntu scripted build (with preflight)
./scripts/build-all-linux.sh --target x86_64-unknown-linux-gnu

# Optional: skip manifest preflight for quick local iteration
./scripts/build-all-linux.sh --target x86_64-unknown-linux-gnu --skip-manifest-check
```

### Release verification (recommended before EXE/MSI/DEB)

```bash
# Linux/macOS
./scripts/verify-release-matrix.sh --target x86_64-unknown-linux-gnu
```

```powershell
# Windows (x64 + ARM64 checks)
.\scripts\verify-release-matrix.ps1 -Targets x86_64-pc-windows-msvc,aarch64-pc-windows-msvc
```

Windows architecture-aware MSI builds:

```powershell
# x64 MSI
.\scripts\build-all-windows.ps1 -Target x86_64-pc-windows-msvc

# ARM64 MSI
.\scripts\build-all-windows.ps1 -Target aarch64-pc-windows-msvc

# Optional: skip manifest preflight for quick local iteration
.\scripts\build-all-windows.ps1 -Target x86_64-pc-windows-msvc -SkipManifestCheck
```

See the platform guides in `docs/` for full prerequisites and step-by-step instructions.

---

## Generating a course

```bash
# Ubuntu (two terminals)
source admin-venv/bin/activate
tools/course_gen/start-server.sh                         # Terminal 1
python tools/course_gen/generate_wiki.py machine-learning  # Terminal 2

# Windows (two PowerShell windows)
admin-venv\Scripts\activate
.\tools\course_gen\start-server.ps1                      # Window 1
python tools\course_gen\generate_wiki.py machine-learning  # Window 2
```

Courses are written to `assets/courses/{course-id}/wiki/`.

---

## Course Manifest UX Workflow

Use the normalizer to keep all courses in a uniform 5-module structure:

```bash
# Normalize all course manifests
python3 scripts/normalize_course_manifests.py

# Validate only (non-zero exit on violations)
python3 scripts/normalize_course_manifests.py --check-only

# Normalize or validate a single course
python3 scripts/normalize_course_manifests.py --course machine-learning
python3 scripts/normalize_course_manifests.py --check-only --course machine-learning
```

Canonical modules enforced by the script:
- getting-started
- core-lectures
- practice
- career-prep
- reference

---

## Clean Old Build Artifacts

To avoid local build bloat before fresh builds:

```bash
./scripts/clean-build-artifacts.sh
```

## Runtime Boundary Guard

Validate strict runtime boundaries (Tauri-only student runtime contract):

```bash
./scripts/check-runtime-boundary.sh
```

## Desktop E2E Smoke (Tauri Window)

Run desktop smoke automation scaffold:

```bash
./scripts/run-desktop-e2e-smoke.sh
```

JavaScript workspaces in this repo are Bun-managed. Use `bun install`, `bun run`, and `bunx` for all JS workflows.

---

## Safer Dev Start

Run Tauri dev with manifest validation preflight:

```bash
./scripts/dev-tauri.sh

# Optional: skip manifest validation for quick local iteration
./scripts/dev-tauri.sh --skip-manifest-check
```

Windows PowerShell:

```powershell
.\scripts\dev-tauri.ps1

# Optional: skip manifest validation
.\scripts\dev-tauri.ps1 -SkipManifestCheck
```

Start admin API only (with automatic port cleanup):

```bash
./scripts/dev-api.sh
```

Start full local stack (API + Tauri):

```bash
./scripts/dev-stack.sh
```

---

## Admin server

```bash
source admin-venv/bin/activate   # or: admin-venv\Scripts\activate on Windows
cd server
uvicorn main:app --reload
# Dashboard: http://localhost:8000/dashboard
```

---

## Architecture

See [`docs/architecture.md`](docs/architecture.md).

Runtime interface ownership and boundaries:
- [`docs/runtime-contract-map.md`](docs/runtime-contract-map.md)

## Architecture Decision Records

- Core runtime and product direction: [`docs/adr/0001-core-product-direction.md`](docs/adr/0001-core-product-direction.md)

## Windows build guide

See [`docs/setup-windows.md`](docs/setup-windows.md).

## Ubuntu dev + DEB build guide

See [`docs/setup-ubuntu.md`](docs/setup-ubuntu.md).

## Android APK build guide

See [`docs/build-android.md`](docs/build-android.md).
