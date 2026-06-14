# Programming Languages & Frameworks Information

This document details the programming languages and frameworks used in the **Student AI** project, and explains why some files resemble JavaScript extensions.

---

## Why the Code "Looks Like JavaScript Extensions"

If you inspect the `frontend/` directory, you will see files ending in `.ts` (TypeScript) and `.svelte` (Svelte components). Here is why:

1. **TypeScript (`.ts`)**: TypeScript is a strict syntactical superset of JavaScript that adds optional static typing. Web browsers cannot execute TypeScript directly, so during the build process, the Vite bundler compiles (transpiles) it into standard, optimized JavaScript (`.js`).
2. **Svelte (`.svelte`)**: Svelte is a component framework. Svelte files contain HTML, CSS, and TypeScript/JavaScript code in a single file. Svelte compiles this file down to tiny, framework-less imperative JavaScript code that surgically updates the DOM (Document Object Model) without using a Virtual DOM.
3. **Tauri Integration**: Tauri bridges the frontend (running inside a secure system Webview) and the backend (written in Rust). The frontend uses a JavaScript package (`@tauri-apps/api`) to invoke backend Rust functions using Inter-Process Communication (IPC) commands.

---

## Programming Languages Used

The project is polyglot to ensure both high performance for local LLM inference and a responsive user interface:

| Language | Primary Role | Key Locations |
| :--- | :--- | :--- |
| **Rust** | System programming language. Powers the core desktop application backend, IPC command routing, local LLM execution, vector search, database management, and indexing. | `src-tauri/`, `crates/` |
| **TypeScript / JavaScript** | App frontend logic, UI components, state management (stores), text stream processing, and IPC wrapper adapters. | `frontend/` |
| **Python** | Powers the admin application server, telemetry dashboard, course generator tools, and markdown manifest cleanup scripts. | `server/`, `tools/course_gen/`, `scripts/` |
| **C++** | The underlying execution engine for `llama.cpp` is written in C/C++. The Rust backend calls into this code via foreign function bindings. | Underlying `llama-cpp-2` dependency |
| **HTML & CSS** | Structure and responsive styling (using pure CSS for maximum control) of the desktop UI. | `frontend/src/` |

---

## Frameworks and Key Libraries Used

### 1. Tauri 2 (Desktop & Mobile Application Framework)
* **What it is:** A toolkit that lets you build secure, lightweight cross-platform desktop and mobile apps using web frontends and Rust backends.
* **Why it's used:** Compared to Electron (which bundles a heavy Chromium browser and Node.js runtime), Tauri uses the operating system's native Webview (WebView2 on Windows, WebKit on macOS/Linux/iOS, and WebView on Android) and compiles a lightweight Rust binary. This keeps the installer size small (a few megabytes) and RAM usage minimal.

### 2. Svelte 4 (Frontend UI Framework)
* **What it is:** A compiler-driven JavaScript framework for building user interfaces.
* **Why it's used:** Instead of doing work in the browser (like React or Vue, which use a Virtual DOM to calculate changes at runtime), Svelte compiles your code at build time into pure, minimal vanilla JavaScript that directly modifies DOM nodes. This results in faster startup times and lower CPU consumption, which is critical for low-resource 8 GB RAM laptops.

### 3. Vite (Frontend Build Tool)
* **What it is:** A fast local development server and bundler.
* **Why it's used:** Provides Hot Module Replacement (HMR) during frontend development and bundles the TypeScript and Svelte code into optimized production assets.

### 4. FastAPI (Python Web Framework)
* **What it is:** A modern, high-performance web framework for building APIs with Python.
* **Why it's used:** Powers the Admin Application's dashboard and telemetry endpoints. It is extremely fast to write and performant to run.

### 5. SQLite (Embedded Database Engine)
* **What it is:** A serverless, self-contained SQL database engine.
* **Why it's used:** Integrated via the Rust `rusqlite` crate under `crates/storage` to store chat histories, settings, and local telemetry persistently on the student's machine.

### 6. Tantivy (Search Engine Library)
* **What it is:** A full-text search engine library written in Rust, inspired by Apache Lucene.
* **Why it's used:** Powers BM25 indexed searching over local course markdown files under `crates/wiki/` to retrieve relevant learning wiki chapters instantly.

### 7. llama.cpp / llama-cpp-2 (Local LLM Inference Engine)
* **What it is:** A C++ implementation of LLM inference optimized for local CPU execution, and its Rust bindings crate.
* **Why it's used:** It handles raw token loading, KV cache management, and token generation on consumer CPUs without needing a cloud server or a high-end GPU.
