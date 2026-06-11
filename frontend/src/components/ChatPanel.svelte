<script lang="ts">
  import { tick, onMount } from "svelte";
  import MessageBubble from "./MessageBubble.svelte";
  import {
    chatStream,
    cancelGeneration,
    getSessionMessages,
    renameChatSession,
    getSetting,
    uploadDocument,
    listDocuments,
    toggleDocSelection,
    deleteDocument,
  } from "../lib/tauri";
  import type { ChatMode, Message } from "../lib/stores";
  import { sessionStore } from "../lib/stores";
  import type { DocumentInfo } from "../lib/tauri";

  export let sessionId: string;
  export let mode: ChatMode;

  let messages: Message[] = [];
  let input = "";
  let isGenerating = false;
  let messagesDiv: HTMLDivElement;
  let textarea: HTMLTextAreaElement;
  let currentAssistantId: string | null = null;

  // ── Refine toggle (thinking mode) ──────────────────────────────────────────
  let refineMode: boolean = localStorage.getItem("refineMode") === "true";
  function toggleRefine() {
    refineMode = !refineMode;
    localStorage.setItem("refineMode", String(refineMode));
  }

  // ── Unified RAG / Document Upload state ────────────────────────────────────
  let docs: DocumentInfo[] = [];
  let ragEnabled = false;
  let uploading = false;
  let uploadError = "";

  async function loadDocs() {
    try {
      docs = await listDocuments();
      if (docs.some(d => d.selected)) {
        ragEnabled = true;
      }
    } catch { /* ignore */ }
  }

  async function handleToggleDoc(doc: DocumentInfo) {
    const newVal = !doc.selected;
    try {
      await toggleDocSelection(doc.id, newVal);
      docs = docs.map(d => d.id === doc.id ? { ...d, selected: newVal } : d);
      if (docs.some(d => d.selected)) {
        ragEnabled = true;
      } else {
        ragEnabled = false;
      }
    } catch { /* ignore */ }
  }

  async function openDocumentDialog(): Promise<string | null> {
    const { invoke } = await import("@tauri-apps/api/core");
    const selected = await invoke<string | string[] | null>("plugin:dialog|open", {
      options: {
        multiple: false,
        filters: [{ name: "Documents", extensions: ["pdf", "txt"] }],
      },
    });
    return typeof selected === "string" ? selected : null;
  }

  async function handleBrowse() {
    const selected = await openDocumentDialog();
    if (!selected) return;
    uploading = true;
    uploadError = "";
    try {
      const parts = selected.replace(/\\/g, "/").split("/");
      const name = parts[parts.length - 1];
      const res = await uploadDocument(selected, name);
      await toggleDocSelection(res.doc_id, true);
      await loadDocs();
      ragEnabled = true;
    } catch (e) {
      uploadError = e instanceof Error ? e.message : String(e);
    } finally {
      uploading = false;
    }
  }

  // ── Custom system prompt ────────────────────────────────────────────────────
  let customSystemPrompt = "";

  onMount(() => {
    // Load persisted custom prompt (fire-and-forget, non-blocking).
    getSetting("custom_system_prompt").then(v => { customSystemPrompt = v ?? ""; }).catch(() => {});
    // Listen for live updates when the user saves a new prompt in Settings.
    const handler = (e: Event) => { customSystemPrompt = (e as CustomEvent<string>).detail; };
    window.addEventListener("systempromptchanged", handler);
    
    // Initial load of documents for this session
    loadDocs();

    return () => window.removeEventListener("systempromptchanged", handler);
  });

  // ── Token batching ──────────────────────────────────────────────────────────
  let tokenBuf = "";
  let bufTimer: ReturnType<typeof setTimeout> | null = null;

  function flushTokenBuf() {
    bufTimer = null;
    if (!tokenBuf || !currentAssistantId) return;
    const buf = tokenBuf;
    const id  = currentAssistantId;
    tokenBuf  = "";
    messages  = messages.map(m => m.id === id ? { ...m, content: m.content + buf } : m);
    if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  async function scrollSmooth() {
    await tick();
    if (messagesDiv) messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: "smooth" });
  }

  // ── Load history from DB on session change ──────────────────────────────────
  $: if (sessionId) loadHistory(sessionId);

  async function loadHistory(sid: string) {
    messages = [];
    try {
      const stored = await getSessionMessages(sid);
      messages = stored.map(m => ({
        id: m.id,
        role: m.role as "user" | "assistant",
        content: m.content,
        timestamp: Date.parse(m.created_at),
      }));
      scrollSmooth();
    } catch { /* ignore */ }
  }

  $: modeLabel =
    ragEnabled                  ? "RAG Context" :
    mode.type === "general"     ? "General" :
    mode.type === "course"      ? `Course: ${(mode as any).course_id}` :
    mode.type === "study_topic" ? `Study: ${(mode as any).page_slug}` : "My Documents";

  async function handleSend() {
    if (!input.trim() || isGenerating) return;
    const userText = input.trim();
    input = "";
    if (textarea) { textarea.style.height = "auto"; }

    messages = [...messages, {
      id: crypto.randomUUID(), role: "user",
      content: userText, timestamp: Date.now(),
    }];

    const assistantId = crypto.randomUUID();
    currentAssistantId = assistantId;
    messages = [...messages, {
      id: assistantId, role: "assistant",
      content: "", streaming: true, timestamp: Date.now(),
    }];
    isGenerating = true;
    scrollSmooth();

    const activeMode = ragEnabled ? { type: "user_docs" as const } : mode;

    try {
      await chatStream(
        { session_id: sessionId, message: userText, mode: activeMode,
          use_plan: refineMode,
          custom_system_prompt: customSystemPrompt || undefined },
        (token) => {
          tokenBuf += token;
          if (!bufTimer) bufTimer = setTimeout(flushTokenBuf, 30);
        },
        () => {
          if (bufTimer) { clearTimeout(bufTimer); bufTimer = null; }
          if (tokenBuf && currentAssistantId) {
            const buf = tokenBuf; tokenBuf = "";
            const id  = currentAssistantId;
            messages = messages.map(m => m.id === id ? { ...m, content: m.content + buf } : m);
          }
          messages = messages.map(m =>
            m.id === assistantId ? { ...m, streaming: false } : m
          );
          isGenerating = false;
          scrollSmooth();

          // Auto-generate session title after first assistant reply
          const userMsgs = messages.filter(m => m.role === "user");
          if (userMsgs.length === 1) {
            const firstUserMsg = userMsgs[0]?.content ?? "";
            const title = firstUserMsg.slice(0, 40).replace(/\n/g, " ").trim() || "New chat";
            sessionStore.rename(sessionId, title);
            renameChatSession(sessionId, title).catch(() => {});
          }
        }
      );
    } catch (err) {
      if (bufTimer) { clearTimeout(bufTimer); bufTimer = null; tokenBuf = ""; }
      messages = messages.map(m =>
        m.id === assistantId
          ? { ...m, content: m.content + `\n\n⚠️ Error: ${err}`, streaming: false }
          : m
      );
      isGenerating = false;
    }
  }

  async function handleCancel() {
    await cancelGeneration();
    if (bufTimer) { clearTimeout(bufTimer); bufTimer = null; tokenBuf = ""; }
    if (currentAssistantId) {
      messages = messages.map(m =>
        m.id === currentAssistantId ? { ...m, streaming: false } : m
      );
    }
    isGenerating = false;
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function onInput(e: Event) {
    const t = e.target as HTMLTextAreaElement;
    t.style.height = "auto";
    t.style.height = Math.min(t.scrollHeight, 160) + "px";
  }
</script>

<div class="panel">
  <!-- Mode pill -->
  <div class="mode-bar">
    <span class="mode-label">Mode:</span>
    <span class="mode-pill">{modeLabel}</span>
  </div>

  <!-- Messages -->
  <div class="messages" bind:this={messagesDiv}>
    {#if messages.length === 0}
      <div class="empty">
        <div class="empty-glyph">🎓</div>
        <h2>Student AI</h2>
        <p>Ask anything. Switch to a course for guided learning, or upload documents to chat about them.</p>
        <div class="empty-hint-row">
          <span class="empty-chip">General</span>
          <span class="empty-chip">Courses</span>
          <span class="empty-chip">Documents</span>
        </div>
      </div>
    {/if}
    {#each messages as msg (msg.id)}
      <MessageBubble message={msg} />
    {/each}
  </div>

  <!-- Input -->
  <div class="input-area">
    <div class="input-box">
      <button
        class="upload-icon-btn"
        disabled={uploading}
        on:click={handleBrowse}
        title="Upload PDF or TXT document for RAG context"
      >
        {#if uploading}
          <span class="spin">↻</span>
        {:else}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        {/if}
      </button>

      <textarea
        bind:this={textarea}
        bind:value={input}
        on:keydown={onKeyDown}
        on:input={onInput}
        placeholder={ragEnabled ? "Ask about your documents..." : "Ask a question..."}
        rows={1}
      />
      
      <label
        class="refine-toggle"
        title={refineMode ? "Refine: ON — native active thinking (detailed answers)" : "Refine: OFF — fast completion"}
      >
        <span class="refine-label">Refine</span>
        <span class="toggle-track" class:on={refineMode} on:click={toggleRefine} on:keydown={(e) => (e.key === ' ' || e.key === 'Enter') && toggleRefine()} role="switch" aria-checked={refineMode} tabindex="0">
          <span class="toggle-thumb"></span>
        </span>
      </label>

      {#if docs.length > 0}
        <label
          class="refine-toggle"
          title={ragEnabled ? "RAG: ON — searches your uploaded documents" : "RAG: OFF — uses general knowledge"}
        >
          <span class="refine-label">RAG</span>
          <span class="toggle-track" class:on={ragEnabled} on:click={() => ragEnabled = !ragEnabled} role="switch" aria-checked={ragEnabled} tabindex="0">
            <span class="toggle-thumb"></span>
          </span>
        </label>
      {/if}

      <button
        class="send-btn"
        class:cancel={isGenerating}
        class:ready={!isGenerating && input.trim()}
        on:click={isGenerating ? handleCancel : handleSend}
        disabled={!isGenerating && !input.trim()}
      >
        {#if isGenerating}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
        {:else}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
        {/if}
      </button>
    </div>

    {#if docs.length > 0 && ragEnabled}
      <div class="active-docs-row">
        {#each docs as doc (doc.id)}
          <div class="doc-chip" class:selected={doc.selected} on:click={() => handleToggleDoc(doc)}>
            <span class="doc-icon">📄</span>
            <span class="doc-chip-name" title={doc.file_name}>{doc.file_name}</span>
            <span class="doc-chip-toggle">{doc.selected ? "✓" : "◦"}</span>
          </div>
        {/each}
      </div>
    {/if}
    {#if uploadError}
      <p class="err-msg">⚠️ {uploadError}</p>
    {/if}

    <p class="hint">Enter to send · Shift+Enter for new line</p>
  </div>
</div>

<style>
  .panel { display: flex; flex-direction: column; height: 100%; background: var(--bg); }

  /* Mode bar */
  .mode-bar {
    padding: 7px 16px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--bg-panel);
  }
  .mode-label { font-size: 10px; color: var(--text-faint); text-transform: uppercase; letter-spacing: .06em; }
  .mode-pill {
    font-size: 11px;
    font-weight: 600;
    color: var(--accent-h);
    background: var(--accent-soft);
    border: 1px solid rgba(99,102,241,.18);
    padding: 2px 10px;
    border-radius: 999px;
    letter-spacing: .02em;
  }

  /* Messages */
  .messages {
    flex: 1;
    overflow-y: auto;
    padding: 20px 20px 8px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Empty state */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: 12px;
    min-height: calc(100% - 40px);
  }
  .empty-glyph {
    width: 52px;
    height: 52px;
    border-radius: 16px;
    background: linear-gradient(135deg, var(--accent-soft) 0%, rgba(139,92,246,.12) 100%);
    border: 1px solid rgba(99,102,241,.2);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 24px;
    box-shadow: 0 4px 20px rgba(99,102,241,.12);
  }
  .empty h2   { font-size: 17px; font-weight: 650; color: var(--text); letter-spacing: -.01em; }
  .empty p    { font-size: 12px; color: var(--text-muted); max-width: 280px; line-height: 1.6; }
  .empty-hint-row {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }
  .empty-chip {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-faint);
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    padding: 3px 10px;
    border-radius: 999px;
    letter-spacing: .03em;
    text-transform: uppercase;
  }

  /* Input */
  .input-area {
    padding: 0px 16px 104px;
    border-top: 1px solid var(--border);
    background:
      linear-gradient(180deg, rgba(255,255,255,0.01) 0%, rgba(255,255,255,0) 48%),
      var(--bg-panel);
  }
  .input-box {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    background: var(--bg-input);
    border: 1px solid color-mix(in srgb, var(--border) 82%, rgba(99,102,241,.18));
    border-radius: 14px;
    padding: 8px 8px 8px 14px;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.035),
      0 10px 22px rgba(2,6,23,.14);
    transition: border-color 150ms, box-shadow 150ms, transform 150ms;
  }
  .input-box:focus-within {
    border-color: rgba(99,102,241,.45);
    box-shadow:
      0 0 0 3px rgba(99,102,241,.08),
      0 12px 28px rgba(2,6,23,.20);
    transform: translateY(-1px);
  }
  textarea {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    font-size: 13px;
    color: var(--text);
    line-height: 1.55;
    min-height: 22px;
    max-height: 160px;
    font-family: inherit;
  }
  textarea::placeholder { color: var(--text-faint); }
  .send-btn {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    border: 1px solid transparent;
    background: rgba(148,163,184,.08);
    color: var(--text-faint);
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 150ms, color 150ms, transform 100ms, border-color 150ms;
  }
  .send-btn:hover:not(:disabled):not(.ready):not(.cancel) {
    background: rgba(148,163,184,.14);
    border-color: var(--border);
  }
  .send-btn.ready {
    background: var(--accent);
    color: #fff;
    box-shadow: 0 2px 10px rgba(99,102,241,.4);
  }
  .send-btn.ready:hover {
    background: var(--accent-h);
    transform: scale(1.05);
  }
  .send-btn.cancel { color: var(--danger); }
  .send-btn.cancel:hover { background: rgba(248,113,113,.1); }
  .send-btn:disabled { color: var(--text-faint); cursor: not-allowed; }

  /* Refine toggle slider */
  .refine-toggle {
    display: flex;
    align-items: center;
    gap: 5px;
    cursor: pointer;
    flex-shrink: 0;
    margin-bottom: 2px;
    user-select: none;
  }
  .refine-label {
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .04em;
    color: var(--text-faint);
    transition: color 150ms;
  }
  .toggle-track {
    width: 28px;
    height: 16px;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--bg-elevated);
    position: relative;
    transition: background 150ms, border-color 150ms;
    flex-shrink: 0;
  }
  .toggle-track.on {
    background: rgba(99,102,241,.35);
    border-color: rgba(99,102,241,.5);
  }
  .toggle-thumb {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--text-faint);
    position: absolute;
    top: 2px;
    left: 2px;
    transition: left 150ms, background 150ms;
  }
  .toggle-track.on .toggle-thumb {
    left: 14px;
    background: var(--accent-h);
  }
  .refine-toggle:hover .refine-label { color: var(--text-muted); }
  .refine-toggle:hover .toggle-track:not(.on) { border-color: rgba(99,102,241,.25); }

  .hint {
    font-size: 10px;
    color: var(--text-faint);
    text-align: center;
    margin-top: 6px;
    letter-spacing: .02em;
  }

  .upload-icon-btn {
    width: 32px;
    height: 32px;
    border-radius: 10px;
    border: none;
    background: rgba(148,163,184,.08);
    color: var(--text-faint);
    cursor: pointer;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 150ms, color 150ms;
  }
  .upload-icon-btn:hover:not(:disabled) {
    background: var(--bg-hover);
    color: var(--accent-h);
  }
  .upload-icon-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .active-docs-row {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 8px;
    padding: 0 4px;
  }
  .doc-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 4px 8px;
    font-size: 10px;
    font-weight: 500;
    color: var(--text-muted);
    cursor: pointer;
    user-select: none;
    transition: border-color 150ms, background 150ms;
  }
  .doc-chip:hover {
    border-color: rgba(99,102,241,.3);
    color: var(--text);
  }
  .doc-chip.selected {
    border-color: rgba(99,102,241,.4);
    background: var(--accent-soft);
    color: var(--accent-h);
  }
  .doc-chip-name {
    max-width: 140px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .doc-chip-toggle {
    font-weight: bold;
    font-size: 10px;
    margin-left: 2px;
  }
  .err-msg {
    font-size: 10px;
    color: var(--danger);
    margin-top: 6px;
    padding: 0 4px;
    text-align: center;
  }
  .spin {
    display: inline-block;
    animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
