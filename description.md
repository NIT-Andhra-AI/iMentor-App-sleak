# Student AI - Project Overview and Features

**Student AI** is a self-contained, CPU-optimized offline desktop (and planned mobile) learning assistant designed specifically for BTech/BE engineering students. It aims to run on low-resource hardware, such as 8 GB RAM laptops with no dedicated GPU, without any external cloud API dependency.

---

## Can we build an APK with this project?

**Yes**, you can build an Android APK from this project. 

The application is built on **Tauri 2**, which has native support for compiling desktop targets as well as mobile targets (Android and iOS). The project includes a dedicated guide and implementation strategy for building an Android APK:
* **Build Guide Location:** `docs/build-android.md`
* **Inference Strategy:** To avoid format conversion to LiteRT `.task` or `.tflite`, the project compiles **`llama.cpp`** as a JNI dynamic library with native **Vulkan/Neon** hardware acceleration. This enables the APK to run the exact same GGUF models downloaded to the device's secure storage.
* **Initialization Command:** `cargo tauri android init --ci` (sets up the Android Gradle environment in `src-tauri/gen/android/`).
* **Build Command:** `cargo tauri android build` produces the release APK at `src-tauri/gen/android/app/build/outputs/apk/release/app-release.apk`.

---

## Core Features of the Project

The workspace implements a **two-app architecture** within a single repository:

### 1. The Student Application (Tauri Desktop/Mobile)
A desktop application that provides direct, secure IPC (Inter-Process Communication) command routing for the student's runtime features. Fallbacks to a browser runtime are strictly disallowed.

* **100% Offline AI Chat:** 
  * Features direct CPU inference using local GGUF models (currently configured for the Qwen 3.5 Instruct 4B model) via a custom `llama-cpp-2` wrapper.
  * Invariant system prompts and prefix-caching ensure sub-second Time-to-First-Token (TTFT) response times (under 800ms) on subsequent conversational turns.
  * Autoregressive single-stage generation (does not block users with multi-stage planning latency).
  * Gemini/ChatGPT-style user interface that displays a collapsible "thought process" block containing the model's reasoning logic `<think>...</think>`.
* **Course and Wiki Module:**
  * Students can download, browse, and read structured course guides.
  * Courses are normalized to a uniform 5-module structure: `getting-started`, `core-lectures`, `practice`, `career-prep`, and `reference`.
  * Integrates full-text search (FTS) indexes over the course markdown wiki files, powered by the **Tantivy** search library.
* **Retrieval-Augmented Generation (RAG):**
  * Allows students to upload private documents (PDFs, text files).
  * Features automatic text chunking and indexing into a local vector database using **HNSW** (Hierarchical Navigable Small World) indexes and **BGE-small** embedding models.
  * Allows toggling RAG mode on and off in the chat console to answer queries using the uploaded document's context.
* **AI Agents:**
  * Spawns autonomous learning/task agents that communicate with students via IPC commands.
* **Resource and UI Optimizations:**
  * Context size budgets adapt dynamically based on host RAM pressure.
  * Performance guardrails render streaming raw text during completion and defer expensive Markdown and LaTeX parsing (via KaTeX and Marked) until the message is finished, eliminating Svelte DOM redraw lag.

### 2. The Admin Application (FastAPI Server & Dashboard)
An operations plane built to manage course delivery and review telemetry.

* **Admin Dashboard:** A web-based interface (accessible at `http://localhost:8000/dashboard`) to view analytics and manage resources.
* **Course Catalog Management:** Endpoints to package, release, and check updates for educational courses.
* **Privacy-Respecting Telemetry:** Ingests de-identified session details and telemetry from student applications (e.g., masking IPs as hashes and striping PII) to optimize the system.

---

## Workspace Directory Structure

* **`src-tauri/`**: The core Tauri 2 desktop application backend (written in Rust). Handles app state, security boundaries, and command orchestration.
* **`frontend/`**: The web UI codebase built using Vite, Svelte 4, and TypeScript.
* **`crates/`**: Separate Rust modules to isolate tasks:
  * `inference/`: `llama.cpp` binding and model generation pipeline.
  * `wiki/`: Tantivy full-text index manager.
  * `rag/`: Vector search indexing.
  * `storage/`: SQLite session store.
  * `telemetry/`: De-identified telemetry dispatcher.
* **`server/`**: The FastAPI server code and admin dashboard.
* **`tools/course_gen/`**: Python utility to auto-generate markdown courses using LLMs.
* **`docs/`**: Deployment, development setup guides, and architectural decisions.
