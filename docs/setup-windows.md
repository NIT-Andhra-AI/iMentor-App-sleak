# Windows Build Guide — Student AI MSI Installer

**Platform**: Windows 10/11 (x86_64, ARM64)  
**Output**: Architecture-tagged MSI variants in `dist\windows\`

---

## Prerequisites

### 1. Rust (MSVC toolchain)
```powershell
winget install Rustlang.Rustup
rustup default stable-x86_64-pc-windows-msvc
# Verify
rustc --version && cargo --version
```

### 2. Visual Studio Build Tools (C++ required by llama.cpp)
```powershell
winget install Microsoft.VisualStudio.2022.BuildTools
# In the installer UI select: "Desktop development with C++"
```

### 3. LLVM / Clang (required by bindgen)
```powershell
winget install LLVM.LLVM
$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"
$env:PATH += ";C:\Program Files\LLVM\bin"
```
Add both vars to your user environment permanently (System → Advanced → Environment Variables).

### 4. Bun (frontend build)
```powershell
irm bun.sh/install.ps1 | iex
# Verify
bun --version
```

### 5. Tauri CLI
```powershell
cargo install tauri-cli --version "^2" --locked
```

### 6. Configure `build_config.toml`
```powershell
# Open src-tauri/build_config.toml and fill in:
server_url     = "https://your-public-ip-or-domain"
server_url_lan = "http://192.168.x.y:8000"   # optional, campus LAN
```

---

## Build A — Net-Download MSI (small, ~50 MB)

Model is downloaded by the app on first launch. No pre-bundled model.

```powershell
# From the repo root
cd frontend && bun install --frozen-lockfile && cd ..
cargo tauri build --target x86_64-pc-windows-msvc
```

Output:
```
src-tauri\target\x86_64-pc-windows-msvc\release\bundle\msi\StudentAI_*.msi
```
Rename/copy to `StudentAI-netdownload-x64.msi` for distribution.

Recommended preflight before packaging:

```powershell
.\scripts\verify-release-matrix.ps1 -Targets x86_64-pc-windows-msvc,aarch64-pc-windows-msvc
```

---

## Build B — With-Model MSI (~2.5 GB)

Phi-4-mini is bundled inside the installer. No internet needed after install.

### Step 1 — Download the model
```powershell
New-Item -ItemType Directory -Force bundled_model
Invoke-WebRequest `
  -Uri "https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf?download=true" `
  -OutFile "bundled_model\phi-4-mini-q4_k_m.gguf" `
  -TimeoutSec 1800
```

### Step 2 — Build with extra config
```powershell
cd frontend && bun install --frozen-lockfile && cd ..
cargo tauri build --target x86_64-pc-windows-msvc `
  --config src-tauri/tauri-withmodel.conf.json
```

Output is the same path as Build A. The model is embedded in the MSI.  
Rename to `StudentAI-withmodel-x64.msi` for distribution.

> **How it works at first launch**: the installer places the GGUF at
> `{InstallDir}\bundled_model\phi-4-mini-q4_k_m.gguf`. On first run the app
> copies it to `%LOCALAPPDATA%\StudentAI\models\` and loads it from there.
> The bundled copy is kept in the install dir and is never deleted by the app.

---

## Which variant to distribute?

| Variant | Size | Use case |
|---------|------|----------|
| `StudentAI-netdownload-x64.msi` | ~50 MB | Students with internet access; model (~2.4 GB) downloads on first launch |
| `StudentAI-withmodel-x64.msi` | ~2.5 GB | College labs, restricted-network environments; fully offline after install |

## Architecture-aware scripted MSI builds

```powershell
# x64 (runs preflight automatically)
.\scripts\build-all-windows.ps1 -Target x86_64-pc-windows-msvc

# ARM64
.\scripts\build-all-windows.ps1 -Target aarch64-pc-windows-msvc

# Skip preflight only when you intentionally need faster local iteration
.\scripts\build-all-windows.ps1 -Target x86_64-pc-windows-msvc -SkipPreflight

# Skip manifest validation preflight only for quick local iteration
.\scripts\build-all-windows.ps1 -Target x86_64-pc-windows-msvc -SkipManifestCheck
```

Generated output examples:
- `dist\windows\StudentAI-cpu-setup-x86_64.msi`
- `dist\windows\StudentAI-gpu-setup-x86_64.msi`
- `dist\windows\StudentAI-cpu-setup-aarch64.msi`

---

## Installation Paths

| Item | Path |
|------|------|
| App binary | `C:\Program Files\Student AI\StudentAI.exe` |
| Bundled model (withmodel only) | `C:\Program Files\Student AI\bundled_model\phi-4-mini-q4_k_m.gguf` |
| User models dir | `%LOCALAPPDATA%\StudentAI\models\` |
| Chat database | `%LOCALAPPDATA%\StudentAI\student_ai.db` |
| RAG index | `%LOCALAPPDATA%\StudentAI\rag_index.bin` |

---

## Distribution Checklist

- [ ] `build_config.toml` filled in (server_url, expiry_date if needed)
- [ ] Build succeeds without errors
- [ ] MSI installs cleanly (Start Menu shortcut appears)
- [ ] First launch: net-download variant shows model download UI
- [ ] First launch: withmodel variant auto-extracts model (no download UI)
- [ ] Chat UI loads and responds after model is ready
- [ ] Settings persist between launches
- [ ] No console window visible in release build

---

## Troubleshooting

### "MSVC not found" / `cl.exe` not on PATH
```powershell
# Reinstall Visual Studio Build Tools, ensure "C++ build tools" is selected.
# Or launch from "Developer PowerShell for VS 2022".
```

### `stdbool.h` not found (bindgen error)
```powershell
# Ensure LIBCLANG_PATH points to your LLVM installation:
$env:LIBCLANG_PATH = "C:\Program Files\LLVM\bin"
```

### Model download fails during Build B
```powershell
# The HuggingFace URL redirects. Use -MaximumRedirection 10 if needed:
Invoke-WebRequest -MaximumRedirection 10 -Uri "..." -OutFile "bundled_model\phi-4-mini-q4_k_m.gguf"
# Or download manually in a browser and place the file at bundled_model\phi-4-mini-q4_k_m.gguf
```

### Visual C++ Redistributable required on user machines
The MSI installer bundles the VC++ runtime automatically via WiX. If users report
"VCRUNTIME140.dll not found", they need:
```
https://aka.ms/vs/17/release/vc_redist.x64.exe
```

---

## Performance (x86_64 CPU-only, Phi-4-mini Q4_K_M)

| Metric | Value |
|--------|-------|
| TTFT (first token) | 1.6–1.9 s |
| Throughput | ~11 tok/s |
| RAM during inference | ~4–5 GB |
| Minimum RAM | 4 GB (8 GB recommended) |

---

## Version Management

Update the version in `src-tauri/tauri.conf.json` before each release:
```json
{ "version": "0.2.0" }
```

