# Student AI — Comprehensive Architecture Reference & Project Blueprint

**Last updated**: 2026-06-01
**Stack**: Tauri 2 (Rust backend) + Svelte 4 (frontend) + llama.cpp via `llama-cpp-2` crate
**Target**: Windows 10/11 student laptops — CPU-first, offline-capable, no admin privileges required
**Current active model**: Qwen 3.5 Instruct (4B Q4_K_M GGUF)

> [!IMPORTANT]
> **For AI sessions**: This document is the definitive master specification. If you are given this file in an empty project directory, it contains all the architectural decisions, component specifications, code patterns, and configurations necessary to recreate the entire codebase from scratch.

---

## 1. Product Overview & Core Specifications

**Student AI** is a self-contained, CPU-optimized offline desktop learning assistant for BTech/BE engineering students.

### Non-Negotiable Product Constraints:
1. **100% Offline Inference**: Direct links against local `llama.cpp` wrapper libraries. No external API dependencies or cloud fallbacks.
2. **Standard Windows Target**: Zero-admin installation in `AppData\Local\`. Installs WebView2 and Microsoft Visual C++ runtime automatically.
3. **Model Name Scrubbing**: Model file names and HuggingFace URLs must never be displayed in the UI. Represented globally as `"AI Language Model"`.
4. **Stable Prefix-Caching**: System prompt must remain 100% invariant across conversational turns. All dynamic contexts (RAG excerpts, outlines) must be appended to the User Message to enable sub-second prefix cache reuse.
5. **No 2-Stage Planning Latencies**: Blocking outline generation passes (previously Refine mode) are completely deleted. The model performs direct single-stage autoregressive completions, leveraging native reasoners.

---

## 2. Technical Stack Specifications

### A. Core Frontend (Vite + Svelte 4 + TypeScript)
* **Reactivity**: Svelte's reactive stores (`writable()`) for state management.
* **Markdown Parser**: `marked` library, optimized to only parse HTML upon completion of token streaming.
* **Math Renderer**: `KaTeX` library, with support for display math (`$$...$$` or `\[...\]`) and inline math (`$...$` or `\(`...`\)`).
* **Code Styling**: Pure CSS custom syntax highlighter mapping Python, JS, TS, Rust, C++, Java, Bash, and SQL keywords, with built-in clipboard copying.

### B. Core Backend (Rust + Tauri 2 + SQLite)
* **Inference Engine (`crates/inference/`)**: Links with `llama-cpp-rs-local`. Manages the physical KV cache, dynamic CPU thread configuration, and logit bias suppression of reasoning blocks.
* **Database (`crates/storage/`)**: SQLite via `rusqlite` for persistent session management, chat histories, de-identified telemetry logs, and local settings.
* **Course FTS (`crates/wiki/`)**: BM25 full-text indexes over bundled course markdown wikis powered by `Tantivy`.
* **RAG Vector DB (`crates/rag/`)**: Local vector database utilizing HNSW indexes and BGE-small embedding models for user document chunking.

---

## 3. Directory Layout Blueprint

```
app/
├── src-tauri/                 # Rust Backend
│   ├── src/commands/          # IPC Endpoints (chat.rs, courses.rs, settings.rs, agents.rs)
│   ├── src/build_config.rs    # Baked compile-time environment constants
│   ├── src/setup.rs           # AppState initialization (Model, DB, Telemetry)
│   ├── src/state.rs           # AppState struct definition
│   ├── src/license.rs         # Inactivity auto-uninstall monitor
│   ├── src/runtime_tuning.rs  # RAM-adaptive context sizing budgets
│   ├── build.rs               # Build-time environment variable injector
│   ├── models-qwen3.toml      # Active model configuration file
│   ├── build_config.toml      # Lifespan and RAG hyperparameter overrides
│   └── tauri.conf.json        # Base Tauri conf with build scripts
│
├── crates/                    # Local Rust Modules
│   ├── inference/             # LlmEngine, KV-cache, CPU profile wrappers
│   ├── wiki/                  # Tantivy full-text course search
│   ├── rag/                   # HNSW indexer and token chunker
│   ├── storage/               # SQLite session and summary persistence
│   └── telemetry/             # Consent-gated telemetry dispatcher
│
├── frontend/                  # Svelte 4 Frontend (TypeScript)
│   ├── package.json           # NPM scripts (dev: "vite", check: "svelte-check")
│   └── src/
│       ├── components/        # Svelte UI Components
│       │   ├── ChatPanel.svelte      # Main chat feed + uploads + dual toggles
│       │   ├── MessageBubble.svelte  # Collapsible rolling thought stream + Markdown
│       │   └── CourseSelector.svelte # Sidebar course directories
│       ├── stores/            # Svelte reactive stores
│       └── lib/tauri.ts       # Tauri IPC core wrappers
│
├── assets/courses/            # Active course manifests and wikis
├── bundled_model/             # GGUF model storage (Git-ignored)
└── .cargo/config.toml         # Force LLAMA_LIB_PROFILE="Release"
```

---

## 4. Architectural Specs: Unified Input & RAG Chat Panel

### Component Spec: `ChatPanel.svelte`
Unifies General Conversation, dynamic RAG Search Contexts, and File Uploads in a single ChatGPT/Gemini-style layout:

```html
<!-- UI Layout Specification -->
<div class="panel">
  <!-- Mode Header -->
  <div class="mode-bar">
    <span class="mode-label">Mode:</span>
    <span class="mode-pill">{modeLabel}</span>
  </div>

  <!-- Chat History Feed -->
  <div class="messages">
    {#each messages as msg}
      <MessageBubble message={msg} />
    {/each}
  </div>

  <!-- Unified Input Console -->
  <div class="input-area">
    <div class="input-box">
      <!-- File Upload button -->
      <button class="upload-icon-btn" disabled={uploading} on:click={handleBrowse}>
        {uploading ? "↻" : "+"}
      </button>

      <textarea placeholder={ragEnabled ? "Ask about your documents..." : "Ask a question..."} />

      <!-- Refine Toggle (turns active thinking ON/OFF) -->
      <label class="refine-toggle">
        <span>Refine</span>
        <span class="toggle-track" class:on={refineMode} on:click={toggleRefine}>
          <span class="toggle-thumb"></span>
        </span>
      </label>

      <!-- RAG Toggle (Visible only if documents are uploaded) -->
      {#if docs.length > 0}
        <label class="refine-toggle">
          <span>RAG</span>
          <span class="toggle-track" class:on={ragEnabled} on:click={() => ragEnabled = !ragEnabled}>
            <span class="toggle-thumb"></span>
          </span>
        </label>
      {/if}

      <button class="send-btn" />
    </div>

    <!-- Active RAG document attachment chips -->
    {#if docs.length > 0 && ragEnabled}
      <div class="active-docs-row">
        {#each docs as doc}
          <div class="doc-chip" class:selected={doc.selected} on:click={() => handleToggleDoc(doc)}>
            <span>📄 {doc.file_name} {doc.selected ? "✓" : "◦"}</span>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
```

### Core Operations:
1. **Dynamic File Uploading**: Clicking `+` calls Tauri Dialog plugin `plugin:dialog|open`. Emits selected `.pdf`/`.txt` file path to Tauri IPC endpoint `upload_document`, dynamically chunks & indexes it, automatically toggles **RAG: ON**, and selects the file.
2. **Unified RAG Injection**: When RAG is ON (`ragEnabled === true`), `chatStream` replaces the general mode with `{ type: "user_docs" }`. Injected excerpts are appended directly into the latest User message in `chat.rs`, leaving the System message untouched for KV caching.

---

## 5. Architectural Specs: Gemini-Style Collapsible Rolling Thinking UI

### Component Spec: `MessageBubble.svelte`
Streams reasoning logs inside a dynamic accordion, collapsing them on final completions to prevent main prompt bloat:

```typescript
// Token stream state machine
function parseMessageContent(rawContent: string): { thinking: string; answer: string; isThinking: boolean } {
  const thinkStart = rawContent.indexOf("<think>");
  const thinkEnd = rawContent.indexOf("</think>");

  if (thinkStart !== -1) {
    if (thinkEnd !== -1) {
      // CoT completed: extract logs and answer
      const thinking = rawContent.substring(thinkStart + 7, thinkEnd).trim();
      const answer = rawContent.substring(thinkEnd + 8).trim();
      return { thinking, answer, isThinking: false };
    } else {
      // CoT streaming: thoughts active, answer empty
      const thinking = rawContent.substring(thinkStart + 7).trim();
      return { thinking, answer: "", isThinking: true };
    }
  }
  return { thinking: "", answer: rawContent, isThinking: false };
}
```

### Markup Specification:
```html
<div class="bubble">
  {#if !isUser}
    <!-- Thinking Container -->
    {#if thinkingText}
      <div class="thinking-container" class:active={isThinking}>
        <div class="thinking-header" on:click={() => { if (!isThinking) thinkingExpanded = !thinkingExpanded; }}>
          <span class="thinking-icon">{isThinking ? "⚡" : "✓"}</span>
          <span class="thinking-title">{isThinking ? "Thinking..." : "Thought Process"}</span>
          {#if !isThinking}
            <span class="thinking-toggle-btn">{thinkingExpanded ? "Collapse ▲" : "Expand ▼"}</span>
          {/if}
        </div>
        {#if isThinking || thinkingExpanded}
          <div class="thinking-body">{thinkingText}</div>
        {/if}
      </div>
    {/if}

    <!-- Answer Stream -->
    {#if message.streaming}
      {#if answerText}
        <p class="streaming-text">{answerText}</p><span class="cursor" />
      {:else if isThinking}
        <span class="cursor" /> <!-- Blinking indicator below thoughts -->
      {/if}
    {:else}
      <div class="markdown">{@html html}</div>
    {/if}
  {/if}
</div>
```

---

## 6. Backend Specification: Dynamic Chat Stream (`chat.rs`)

The Rust IPC chat controller manages histories, budgets, and streams completions cleanly in a single pass:

```rust
#[tauri::command]
pub async fn chat_stream(
    request: ChatRequest,
    channel: Channel<TokenEvent>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    // 1. Map Refine toggle to reasoning: If use_plan (Refine) is true, set no_think = false
    let no_think = !request.use_plan.unwrap_or(false);
    
    // 2. Fetch history and adaptive token budgets from RAM pressure
    let ram = ModelManager::ram_snapshot_mb();
    let max_tokens = adaptive_max_tokens_from_ram(n_ctx, ram);

    let params = GenerationParams {
        max_tokens,
        temperature: 0.7,
        top_p: 0.9,
        repeat_penalty: 1.1,
        system_prompt: None,
        no_think, // Driving active reasoning block
    };

    // 3. Assemble stable static System Prompt + User RAG excerpts
    let mut messages = vec![ChatMessage {
        role: "system".to_string(),
        content: build_system_prompt(&mode, ""), // Keep static for KV prefix cache hits
    }];
    
    messages.extend(history); // Append truncated history

    let user_content = if context.is_empty() {
        request.message.clone()
    } else {
        format!("Reference:\n{}\n\nQuestion: {}", context, request.message)
    };
    messages.push(ChatMessage { role: "user".to_string(), content: user_content });

    // 4. Spin up streamed thread block
    tokio::task::spawn(async move {
        let mut llm_guard = state.llm.lock().await;
        if let Some(llm) = llm_guard.as_mut() {
            tokio::task::block_in_place(|| {
                // Stream directly in a single continuous pass
                llm.generate_stream(&messages, &params, token_tx, cancel_flag);
            });
        }
    });
    Ok(())
}
```

---

## 7. Solved Pitfalls (DO NOT REINTRODUCE)

### A. KV-Cache Prefix Invalidation
* **Mistake**: Injecting outlines or RAG context inside the System Prompt.
* **Symptom**: High TTFTs ($\sim 10$–$20$s) on turn 2 and turn 3 due to full cold pre-fills.
* **Fix**: Force System Prompt to remain static. Append RAG context and response structure plan directly into the User Message. Overlap prefix matching drops subsequent TTFTs below **800 ms**.

### B. O(n²) Svelte DOM Re-parse Lag
* **Mistake**: Parsing markdown and LaTeX dynamically on every streamed token.
* **Symptom**: Extreme browser lag, text freezing, and 90%+ CPU spikes when output is large.
* **Fix**: Render unparsed plain text (`streaming-text`) during streaming, parse HTML only when `message.streaming === false`.

### C. GGUF Compilation Speed Cap
* **Mistake**: Compiling without `-O3` optimizations or vectorization flags.
* **Symptom**: Inference output crawling at $\sim 1$–$2$ tokens per second.
* **Fix**: Force `LLAMA_LIB_PROFILE = "Release"` in `.cargo/config.toml` and compile backend using `-C target-cpu=native`.

---

## 8. Deployment and Verification

```powershell
# 1. Compile backend
$env:RUSTFLAGS="-C target-cpu=native"
cargo check

# 2. Check Svelte typings
cd frontend
npm run check

# 3. Build setup package (NSIS installer)
bunx @tauri-apps/cli build
```

---

## 9. Git Workflow

```powershell
# After making changes and verifying tests pass:
git add -A
git commit -m "fix: <description>"

# NEVER commit to main directly in production — always verify installer works first:
# 1. cargo check -p inference   (fast compile check)
# 2. bunx @tauri-apps/cli build
# 3. Install + run benchmark
# 4. git commit
```

---

*This document is the authoritative source of truth for all AI coding sessions on this project. Update it whenever architectural decisions change or new bugs/fixes are discovered.*
