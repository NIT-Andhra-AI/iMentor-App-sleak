<script lang="ts">
  import { tick } from "svelte";
  import { chatStream, cancelGeneration } from "../lib/tauri";
  import type { ChatMode } from "../lib/stores";
  import { studyContext } from "../lib/stores";

  export let currentTopic: { courseId?: string; pageSlug?: string; pageTitle?: string } = {};

  let isOpen = false;
  let isMinimized = false;
  let messages: Array<{ id: string; role: "user" | "assistant"; content: string; streaming?: boolean }> = [];
  let input = "";
  let isGenerating = false;
  let messagesDiv: HTMLDivElement;
  let textarea: HTMLTextAreaElement;
  let currentAssistantId: string | null = null;
  let tokenBuf = "";
  let bufTimer: ReturnType<typeof setTimeout> | null = null;

  function flushTokenBuf() {
    bufTimer = null;
    if (!tokenBuf || !currentAssistantId) return;
    const buf = tokenBuf;
    const id = currentAssistantId;
    tokenBuf = "";
    messages = messages.map(m => m.id === id ? { ...m, content: m.content + buf } : m);
    if (messagesDiv) messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  async function scrollSmooth() {
    await tick();
    if (messagesDiv) messagesDiv.scrollTo({ top: messagesDiv.scrollHeight, behavior: "smooth" });
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
    t.style.height = Math.min(t.scrollHeight, 100) + "px";
  }

  async function handleSend() {
    if (!input.trim() || isGenerating) return;
    const userText = input.trim();
    input = "";
    if (textarea) textarea.style.height = "auto";

    messages = [...messages, {
      id: crypto.randomUUID(),
      role: "user",
      content: userText,
    }];

    const assistantId = crypto.randomUUID();
    currentAssistantId = assistantId;
    messages = [...messages, {
      id: assistantId,
      role: "assistant",
      content: "",
      streaming: true,
    }];
    isGenerating = true;
    scrollSmooth();

    try {
      // Build context from current topic
      let contextStr = "";
      if (currentTopic.pageTitle && currentTopic.pageSlug) {
        contextStr = `[Current topic: ${currentTopic.pageTitle} (${currentTopic.pageSlug})] `;
      }
      const finalQuestion = contextStr + userText;

      // Use the current topic's course for course mode, else general
      const mode: ChatMode = currentTopic.courseId
        ? { type: "course", course_id: currentTopic.courseId }
        : { type: "general" };

      await chatStream(
        { session_id: "floating-chat", message: finalQuestion, mode },
        (token) => {
          tokenBuf += token;
          if (!bufTimer) bufTimer = setTimeout(flushTokenBuf, 30);
        },
        () => {
          if (bufTimer) { clearTimeout(bufTimer); bufTimer = null; }
          if (tokenBuf && currentAssistantId) {
            const buf = tokenBuf;
            tokenBuf = "";
            const id = currentAssistantId;
            messages = messages.map(m => m.id === id ? { ...m, content: m.content + buf } : m);
          }
          messages = messages.map(m =>
            m.id === assistantId ? { ...m, streaming: false } : m
          );
          isGenerating = false;
          scrollSmooth();
        }
      );
    } catch (e) {
      console.error("Chat error:", e);
      isGenerating = false;
    }
  }

  async function handleCancel() {
    try {
      await cancelGeneration();
    } catch (e) {
      console.error("Cancel error:", e);
    }
  }

  function toggleMinimize() {
    isMinimized = !isMinimized;
  }

  function toggleOpen() {
    isOpen = !isOpen;
    if (isOpen) {
      isMinimized = false;
      setTimeout(() => {
        if (textarea) textarea.focus();
        scrollSmooth();
      }, 100);
    }
  }
</script>

<!-- Floating Chat Widget -->
{#if isOpen}
  <div class="floating-chat" class:minimized={isMinimized}>
    <!-- Header -->
    <div class="chat-header">
      <div class="header-title">
        <span class="title-text">Ask about this topic</span>
        {#if currentTopic.pageTitle}
          <span class="topic-badge">{currentTopic.pageTitle}</span>
        {/if}
      </div>
      <div class="header-controls">
        <button class="header-btn" title={isMinimized ? "Expand" : "Minimize"} on:click={toggleMinimize}>
          {#if isMinimized}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="12" x2="20" y2="12"/></svg>
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="4" x2="20" y2="20"/><line x1="20" y1="4" x2="4" y2="20"/></svg>
          {/if}
        </button>
      </div>
    </div>

    {#if !isMinimized}
      <!-- Messages -->
      <div class="chat-messages" bind:this={messagesDiv}>
        {#each messages as msg (msg.id)}
          <div class="message" class:user={msg.role === "user"}>
            <div class="message-bubble">
              {msg.content}
              {#if msg.streaming}
                <span class="cursor">▌</span>
              {/if}
            </div>
          </div>
        {/each}
      </div>

      <!-- Input -->
      <div class="chat-input-area">
        <div class="input-box">
          <textarea
            bind:this={textarea}
            bind:value={input}
            on:keydown={onKeyDown}
            on:input={onInput}
            placeholder="Ask a question..."
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
    {/if}
  </div>
{:else}
  <!-- Floating button when closed -->
  <button class="floating-btn" title="Open topic chat" on:click={toggleOpen}>
    💬
  </button>
{/if}

<style>
  .floating-btn {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 50px;
    height: 50px;
    border-radius: 50%;
    background: var(--accent);
    border: none;
    cursor: pointer;
    font-size: 22px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 150ms, box-shadow 150ms;
    z-index: 999;
  }

  .floating-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
  }

  .floating-btn:active {
    transform: scale(0.95);
  }

  .floating-chat {
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 360px;
    height: 500px;
    background: #0f141c;
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12);
    display: flex;
    flex-direction: column;
    z-index: 999;
    overflow: hidden;
  }

  .floating-chat.minimized {
    height: auto;
  }

  .chat-header {
    padding: 10px 14px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
    background: #141a23;
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
  }

  .title-text {
    font-size: 12px;
    font-weight: 600;
    color: var(--text);
  }

  .topic-badge {
    font-size: 10px;
    color: var(--accent-h);
    background: var(--accent-soft);
    padding: 2px 8px;
    border-radius: 999px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 150px;
  }

  .header-controls {
    display: flex;
    gap: 4px;
  }

  .header-btn {
    background: none;
    border: none;
    color: var(--text-muted);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background 150ms, color 150ms;
  }

  .header-btn:hover {
    background: var(--bg-input);
    color: var(--text);
  }

  .chat-messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px 12px 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .message {
    display: flex;
    gap: 6px;
  }

  .message.user {
    justify-content: flex-end;
  }

  .message-bubble {
    max-width: 80%;
    padding: 8px 12px;
    border-radius: 10px;
    font-size: 12px;
    line-height: 1.4;
    word-wrap: break-word;
  }

  .message.user .message-bubble {
    background: #1a2333;
    color: var(--accent-h);
    border: 1px solid rgba(99, 102, 241, 0.2);
  }

  .message:not(.user) .message-bubble {
    background: #171d27;
    color: var(--text);
    border: 1px solid var(--border);
  }

  .cursor {
    animation: blink 1s infinite;
    margin-left: 2px;
  }

  @keyframes blink {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
  }

  .chat-input-area {
    padding: 8px 10px 10px;
    border-top: 1px solid var(--border);
    background:
      linear-gradient(180deg, rgba(255,255,255,.02) 0%, rgba(255,255,255,0) 52%),
      #141a23;
    flex-shrink: 0;
  }

  .input-box {
    display: flex;
    align-items: flex-end;
    gap: 6px;
    background: var(--bg-input);
    border: 1px solid color-mix(in srgb, var(--border) 82%, rgba(99,102,241,.2));
    border-radius: 8px;
    padding: 6px 6px 6px 10px;
    box-shadow:
      inset 0 1px 0 rgba(255,255,255,.035),
      0 8px 18px rgba(2,6,23,.18);
    transition: border-color 150ms, box-shadow 150ms;
  }

  .input-box:focus-within {
    border-color: rgba(99, 102, 241, 0.45);
    box-shadow:
      0 0 0 2px rgba(99, 102, 241, 0.08),
      0 10px 20px rgba(2,6,23,.22);
  }

  textarea {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    resize: none;
    font-size: 12px;
    font-family: inherit;
    color: var(--text);
    min-height: 24px;
    max-height: 80px;
    overflow-y: auto;
  }

  textarea::placeholder {
    color: var(--text-faint);
  }

  .send-btn {
    background: rgba(148,163,184,.08);
    border: 1px solid transparent;
    color: var(--text-faint);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    transition: color 150ms, background 150ms, border-color 150ms;
    flex-shrink: 0;
  }

  .send-btn:hover:not(:disabled) {
    color: var(--accent-h);
    background: var(--accent-soft);
    border-color: rgba(99,102,241,.22);
  }

  .send-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .send-btn.cancel {
    color: var(--text-faint);
  }

  .send-btn.cancel:hover:not(:disabled) {
    color: var(--text);
    background: var(--bg-elevated);
  }
</style>
