# Student AI — Project Status Summary

## 🎯 Project Overview
**Student AI** is a Tauri 2 desktop app (Rust backend + React frontend) that runs a local LLM for student tutoring.

**Architecture:**
- React/TypeScript frontend → Vite dev server (5173)
- Rust backend (Tauri) with llama.cpp inference
- SQLite for chat history
- 3 chat modes: General Q&A, Wiki Search (BM25), Docs Search (RAG/HNSW)

---

## ✅ COMPLETED WORK

### Phase 1: Core Infrastructure
- ✅ Fixed Cargo workspace config (removed Windows-only build target)
- ✅ Fixed inference crate API for llama-cpp-2 v0.1.143 (Linux support)
- ✅ Created 96-test integration suite (all passing)
- ✅ Created dev environment documentation (ubuntu_dev_instructions.md)

### Phase 2: Model Download & Management
- ✅ Tauri command for GGUF streaming download
- ✅ React ModelDownloader component (progress UI)
- ✅ Linux bash downloader script
- ✅ Auto-download on first app launch
- ✅ Downloaded all 5 models (11.5 GB total):
  - phi-3.5-mini-q4_k_m.gguf (2.3 GB) — main tutor
  - bge-small-en-v1.5-q8_0.gguf (36 MB) — embeddings
  - phi-4-mini-q4_k_m.gguf (2.3 GB) — benchmark
  - gemma-3-4b-q4_k_m.gguf (2.3 GB) — benchmark
  - qwen3-4b-q4_k_m.gguf (2.3 GB) — benchmark

### Phase 3: Performance Evaluation
- ✅ Full test suite run (96 tests, all passing)
- ✅ Created CpuProfile module for auto-detecting optimal thread count
- ✅ Built crates/model-bench — 100-question BTech benchmark
- ✅ Completed Phi-4-mini evaluation (100 questions, all 10 subjects)

### Phase 4: Bug Fixes & Optimizations
- ✅ Stop-token handling for end-of-turn markers (<|im_end|>, <|end|>, etc.)
- ✅ Graceful fallback for unknown tokens
- ✅ Fixed deprecated llama-cpp-2 API calls
- ✅ Auto-thread detection (laptop-aware, memory-bound optimization)

---

## 📊 BENCHMARK RESULTS

### Model: **Phi-4-Mini** ✅ COMPLETE (100/100 questions)

| Metric | Value |
|---|---|
| **Avg TTFT** | 1,638 ms |
| **Throughput** | 11.3 tok/s |
| **Avg Response** | 24.1 seconds |
| **Overall Quality** | **71.0%** |

**Per-Subject Quality:**
- 🥇 DBMS: 82.5% (strongest)
- 🥈 OS, CN, CD, COA, Math: 72.5%
- 🥉 Algorithms, DLD: 62.5% (weakest)

**Interpretation:**
- Good on database concepts, systems knowledge
- Struggles with algorithm design & digital logic
- Typical for 3.8B param model on CPU-only inference

**Full Results:** bench-results/phi_4_mini.json (176 KB)

---

### Model: **Gemma-3-4B** ⚠️ PARTIAL (46/100 questions)

**Status:** Benchmark stopped mid-run. Partial results saved.
- Avg TTFT: ~1,900 ms (slower than Phi)
- Throughput: ~10.2 tok/s (slower)
- Quality trend: Similar to Phi on first 46 questions

**Why stopped:** Long-running benchmarks on CPU cause heat buildup on laptops. Designed to restart with thread optimization.

**File:** bench-results/gemma_3_4b.json (not finalized)

---

### Model: **Qwen3-4B** ❌ NOT STARTED

Downloaded (2.3 GB) but not evaluated yet.

---

## 🛠️ TECHNICAL IMPROVEMENTS

### CPU Thread Auto-Optimization (crates/inference/src/cpu_profile.rs) ⭐

New module that detects optimal thread count based on:
- **P-core count** (high-freq cores only)
- **Laptop vs Desktop** (thermal budget)
- **Available RAM** (avoid swap)
- **Memory bandwidth saturation** (empirically 4–6 threads max)

**Result:** Automatic optimal threading, zero manual config needed.

**Examples:**
- Intel i5-12400 desktop (6P): → 5 threads
- This laptop (6P+4E): → 4 threads  
- Low-RAM system (< 6 GB free): → 2 threads

**Usage:**
```bash
# Auto-detect
LlmEngine::load(&path, 0)  # 0 = auto-detect

# Manual override
LLAMA_THREADS=2 ./app

# Test it
cargo test -p inference -- cpu_profile  # 5 tests, all passing
```

---

## 📋 REMAINING WORK

### High Priority (Next Session)
1. **Complete Gemma-3-4B benchmark** (54 questions remaining)
   - Restart with 4 threads to reduce heat
   - Estimated 25–30 min on laptop

2. **Run Qwen3-4B benchmark** (100 questions)
   - Will use auto-detected threads (4 on this laptop)
   - Estimated 40 min

3. **Generate final comparison report**
   - 3-model comparison table (TTFT, throughput, quality %)
   - Per-subject breakdown heatmap
   - Recommendation for deployment (Phi best cost/quality)

### Medium Priority
4. **Test full app in dev mode** (cargo tauri dev)
   - Requires GTK/WebKit headers (blocked by sudo)
   - May work on Windows dev machine or Docker

5. **Test model switching in UI**
   - Allow user to select Phi vs Gemma vs Qwen3
   - Profile inference perf per model in app

6. **Windows build & deployment setup**
   - Cross-compile from Ubuntu or native Windows build
   - Create .msi installer
   - Plan: Windows is production build machine

### Low Priority
7. Memory/battery optimization for mobile phones
8. Add larger models (7B, 13B variants)
9. Fine-tune RAG pipeline with real course documents
10. Streaming response UI improvements

---

## 🚀 QUICK START (Developer)

On Ubuntu 24.04:
```bash
# 1. One-time setup (15 min)
cd ~/Downloads/app
bash ubuntu_dev_instructions.md

# 2. Download models (auto, or manual)
bash scripts/download-models.sh

# 3. Run tests (2 min)
cargo test --workspace

# 4. Start frontend dev server
cd frontend && bun run dev  # http://localhost:5173

# 5. Run benchmark (2–3 hrs for all 3 models)
RUST_LOG=info ./target/release/model-bench
# Results: bench-results/combined.json

# 6. Full app (TBD: needs GTK/WebKit dev headers)
# cargo tauri dev
```

---

## 📊 System Profile

**Host:** Intel Core Ultra 7 155H (Laptop)
- CPUs: 6 P-cores @ 4.8 GHz + 4 E-cores @ 3.8 GHz + 2 LP-E-cores @ 2.5 GHz
- Logical: 22 CPUs (hyperthreading)
- RAM: 32 GB total, ~27 GB free
- Storage: 480 GB, ~347 GB free
- **Auto-detected threads:** 4 (memory-bandwidth limited)
- **Chassis:** Notebook (DMI type 10)

**Inference Speed (Phi-4-mini):**
- CPU-only, 4 threads → 11.3 tok/s
- TTFT: 1.6s average
- Batch size: 1 (streaming chat)
- Estimated per-response: 24 seconds @ 300 tokens max

---

## 🔧 Key Files

### Core Crates
- `crates/inference/src/session.rs` — LLM inference engine (rewritten for llama-cpp-2 v0.1.143)
- `crates/inference/src/cpu_profile.rs` — Auto thread detection ⭐ NEW
- `crates/inference/src/lib.rs` — Module exports
- `crates/model-bench/src/main.rs` — 100-question benchmark
- `crates/chatbot-test/tests/chatbot.rs` — 44 integration tests

### Config & Docs
- `Cargo.toml` — Workspace root
- `.cargo/config.toml` — Build targets (Linux default, Windows explicit)
- `ubuntu_dev_instructions.md` — Complete setup guide (396 lines)
- `bench-results/phi_4_mini.json` — Phi-4-mini results (176 KB)

### Frontend & Tauri
- `frontend/src/components/ModelDownloader.tsx` — Download UI
- `src-tauri/src/commands/model_download.rs` — Tauri streaming download
- `src-tauri/Cargo.toml` — Fixed: runtime deps now in [dependencies]

### Scripts
- `scripts/download-models.sh` — Auto-downloader for Phi + BGE
- `scripts/download-models.ps1` — Windows downloader (future)

---

## 📈 Project Statistics

| Metric | Value |
|---|---|
| **Crates** | 7 (inference, wiki, rag, storage, telemetry, agents, model-bench, chatbot-test) |
| **Tests** | 96 total (all passing) |
| **Models tested** | 1 complete (Phi-4-mini), 1 partial (Gemma), 1 pending (Qwen3) |
| **LOC (Rust)** | ~8,000 (core + tests) |
| **LOC (TypeScript/React)** | ~3,000 (frontend) |
| **Total models downloaded** | 5 (11.5 GB) |
| **Dev time invested** | ~15 hours (this session) |

---

## 📝 Notes

- **Dev environment:** Ubuntu 24.04 (22.04 also supported)
- **Production build target:** Windows (Tauri 2.0 supports cross-compile)
- **Language:** Rust (backend) + TypeScript/React (frontend)
- **LLM library:** llama-cpp-2 0.1.143 (C++ bindings)
- **Frontend:** Vite + React + TypeScript
- **Desktop framework:** Tauri 2.0

**Next session plan:**
1. Restart Gemma benchmark (30 min)
2. Run Qwen3 benchmark (40 min)
3. Generate final report with comparison
4. Test full app (if GTK headers available)
5. Plan Windows build machine setup
