<script lang="ts">
  import { onMount, tick } from "svelte";
  import { chatStream, cancelGeneration } from "../lib/tauri";
  import MessageBubble from "./MessageBubble.svelte";
  import type { Message } from "../lib/stores";
  import type { StudyContext } from "../lib/stores";

  export let context: StudyContext | null;

  // In-memory only — not persisted
  let messages: Message[] = [];
  let input = "";
  let isGenerating = false;
  let messagesDiv: HTMLDivElement;
  let currentAssistantId: string | null = null;
  let sessionId = crypto.randomUUID();

  let tokenBuf = "";
  let bufTimer: ReturnType<typeof setTimeout> | null = null;

  function flushTokenBuf() {
    bufTimer = null;
    if (!tokenBuf || !currentAssistantId) return;
    const buf = tokenBuf; tokenBuf = "";
    const id  = currentAssistantId;
    messages  = messages.map(m => m.id === id ? { ...m, content: m.content + buf } : m);
    if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  async function scrollSmooth() {
    await tick();
    if (messagesDiv) messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: "smooth" });
  }

  $: studyMode = context
    ? { type: "study_topic" as const, course_id: context.courseId, page_slug: context.pageSlug, page_content: context.pageContent }
    : { type: "general" as const };

  async function handleSend() {
    if (!input.trim() || isGenerating) return;
    const userText = input.trim();
    input = "";

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

    try {
      await chatStream(
        { session_id: sessionId, message: userText, mode: studyMode },
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
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }
</script>

<div class="study-chat-body">
  <div class="messages" bind:this={messagesDiv}>
    {#if messages.length === 0}
      <div class="empty-hint">Ask a question about this topic…</div>
    {/if}
    {#each messages as msg (msg.id)}
      <MessageBubble message={msg} />
    {/each}
  </div>

  <div class="input-row">
    <textarea
      bind:value={input}
      on:keydown={onKeyDown}
      placeholder="Ask about this topic…"
      rows={1}
    />
    <button
      class="send-btn"
      class:cancel={isGenerating}
      class:ready={!isGenerating && input.trim()}
      on:click={isGenerating ? handleCancel : handleSend}
      disabled={!isGenerating && !input.trim()}
    >
      {#if isGenerating}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
      {/if}
    </button>
  </div>
</div>

<style>
  .study-chat-body {
    display: flex; flex-direction: column; height: 100%; max-height: 300px;
    background: var(--bg-panel);
  }
  .messages {
    flex: 1; overflow-y: auto; padding: 8px 12px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .empty-hint { font-size: 11px; color: var(--text-faint); text-align: center; padding: 12px 0; line-height: 1.6; }
  .input-row {
    display: flex; align-items: flex-end; gap: 6px;
    padding: 6px 10px 8px;
    border-top: 1px solid var(--border);
    background:
      linear-gradient(180deg, rgba(255,255,255,.02) 0%, rgba(255,255,255,0) 50%),
      var(--bg-elevated);
  }
  textarea {
    flex: 1;
    background: var(--bg-input); border: 1px solid color-mix(in srgb, var(--border) 84%, rgba(99,102,241,.2));
    border-radius: 9px; color: var(--text); font-size: 12px;
    padding: 6px 10px; outline: none; resize: none;
    min-height: 30px; max-height: 80px; font-family: inherit; line-height: 1.45;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.03),
      0 6px 14px rgba(2,6,23,.12);
    transition: border-color 150ms, box-shadow 150ms;
  }
  textarea::placeholder { color: var(--text-faint); }
  textarea:focus {
    border-color: rgba(99,102,241,.45);
    box-shadow: 0 0 0 2px rgba(99,102,241,.08), 0 8px 16px rgba(2,6,23,.16);
  }
  .send-btn {
    width: 28px; height: 28px; border-radius: 8px; border: none;
    background: transparent; cursor: pointer; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: background 150ms, color 150ms, transform 100ms;
  }
  .send-btn.ready  { color: var(--accent-h); }
  .send-btn.ready:hover { background: var(--accent-soft); transform: scale(1.05); }
  .send-btn.cancel { color: var(--danger); }
  .send-btn.cancel:hover { background: rgba(248,113,113,.1); }
  .send-btn:disabled { color: var(--text-faint); cursor: not-allowed; }
</style>
