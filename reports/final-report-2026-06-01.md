# Student AI — Build, Install & Test Report
**Date:** 2026-06-01  
**Model:** Qwen3.5-4B-Q4_K_M (chat-model-6.gguf, 2 873 MB)  
**Platform:** Windows x64, CPU-only inference

---

## 1. Build

| Item | Value |
|------|-------|
| Build target | `x86_64-pc-windows-msvc` (net installer) |
| Installer size | **43.60 MB** |
| Output | `dist/windows/StudentAI-net-setup-x86_64.exe` |
| Config | `src-tauri/tauri.conf.json` |
| Embedded assets | BGE-small-en-v1.5-q8_0.gguf (35 MB), course wikis |
| LLM delivery | Downloaded on first launch (or copied from sidecar `llm.gguf`) |

Build completed successfully with `cargo tauri build --target x86_64-pc-windows-msvc`.

---

## 2. Installation

| Item | Value |
|------|-------|
| Install path | `C:\Users\sriph\AppData\Local\Student AI\` |
| App executable | `student-ai.exe` (29.5 MB) |
| LLM installed as | `chat-model-6.gguf` (2 873 MB) |
| Embedding model | `rag-model-1.gguf` (35 MB) |
| Old version | Uninstalled cleanly before install |
| Install mode | Net installer — LLM downloaded after install |

---

## 3. Inference Metrics (3 real runs, installed app)

Tests run against the installed `student-ai.exe` via CDP (Playwright attaches to WebView2).  
Source: `reports/installed-playwright-metrics.json`  

### Latency

| Run | Prompt | TTFT (ms) | Total (ms) |
|-----|--------|-----------|------------|
| 1 | Gradient descent | **13 029** | 76 605 |
| 2 | Overfitting & regularisation | **12 523** | 79 616 |
| 3 | Supervised vs unsupervised | **12 760** | 73 939 |
| **Avg** | | **12 771 ms (~12.8 s)** | **76 720 ms (~76.7 s)** |

### Memory & Threads (peak per run)

| Run | student-ai RAM (MB) | Threads | WebView2 RAM (MB) |
|-----|---------------------|---------|-------------------|
| 1 | 4 314 | 37 | 694 |
| 2 | 4 319 | 33 | 712 |
| 3 | 4 319 | 34 | 730 |
| **Avg** | **4 317 MB (4.2 GB)** | **34.7** | **712 MB** |

**Total process footprint (app + WebView2):** ~5 029 MB (~4.9 GB)  
**Headroom on 8 GB laptop:** ~3 GB free for OS + browser tabs.

### Token Throughput (estimated)

Response lengths averaged ~450 tokens at ~76.7s total → **≈ 5.9 tokens/second** CPU-only on x64 laptop.

---

## 4. Playwright E2E Tests

All tests run against the Vite dev server (`http://localhost:5173`) with the Tauri IPC fully mocked via `installTauriMock`.

| Suite | Tests | Passed | Failed | Notes |
|-------|-------|--------|--------|-------|
| smoke | 1 | **1** | 0 | App loads, no JS errors |
| general-chat | 13 | **13** | 0 | Streaming, markdown, LaTeX, stop, history |
| course-chat | 12 | **12** | 0 | BM25 search, mode pill, course selection |
| rag-documents | 10 | **10** | 0 | Upload, delete, RAG mode pill, markdown table, KaTeX |
| **Total** | **36** | **36** | **0** | **100% pass** |

### rag-documents fix applied this session

The Documents nav tab was removed in a prior refactor (RAG is now inline in ChatPanel).  
The spec was rewritten to use:
- `.upload-icon-btn` — the inline `+` button to trigger file upload
- `.doc-chip` — chips rendered per uploaded document
- `fs.existsSync` guards were removed (Tauri mock intercepts `plugin:dialog|open` and `upload_document` without touching the filesystem — no real PDF needed)

---

## 5. Summary

| Dimension | Result | Status |
|-----------|--------|--------|
| Net installer size | 43.60 MB | ✅ Under 50 MB target |
| First-token latency | ~12.8 s | ✅ Acceptable for CPU-only |
| Full-response latency | ~76.7 s | ✅ ~450 token answers |
| Peak app RAM | ~4.2 GB | ✅ Fits 8 GB laptop |
| Peak total RAM (app + WebView) | ~4.9 GB | ✅ ~3 GB headroom |
| Throughput | ~5.9 tok/s | ✅ Usable for study Q&A |
| E2E tests | 36/36 passed | ✅ All suites green |

---

## 6. Artefacts

| File | Description |
|------|-------------|
| `dist/windows/StudentAI-net-setup-x86_64.exe` | Production NSIS net installer |
| `reports/installed-playwright-metrics.json` | Raw inference + memory metrics (3 runs) |
| `reports/playwright-rag-final.txt` | rag-documents test run output (10/10 pass) |
| `tests/desktop-e2e/rag-documents.spec.ts` | Updated spec (inline RAG, no fs guards) |
