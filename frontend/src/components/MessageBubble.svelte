<script lang="ts">
  import katex from "katex";
  import "katex/dist/katex.min.css";
  import { Marked } from "marked";
  import type { Message } from "../lib/stores";

  export let message: Message;
  $: isUser = message.role === "user";
  const markdownParser = new Marked({ breaks: true, gfm: true });

  function escapeHtml(value: string): string {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function normalizeMarkdownTables(content: string): string {
    // 1. Remove blank lines between table rows (LLMs often emit one row per paragraph)
    let result = content.replace(
      /(\|[^\n]*\|[ \t]*)\n([ \t]*\n)+(?=\|)/g,
      "$1\n"
    );
    // 2. Ensure a blank line before a table header that directly follows other text
    result = result.replace(
      /([^\n])\n(\|[^\n]*\|\s*\n\|[-:| ]+\|)/g,
      "$1\n\n$2"
    );
    return result;
  }

  // ── Syntax highlighting (lightweight, mirrors CodeBlock.svelte) ─────────────
  const CODE_KEYWORDS: Record<string, string[]> = {
    python:     ["def","class","import","from","return","if","else","elif","for","while","in","not","and","or","True","False","None","lambda","with","as","try","except","finally","yield","async","await","pass","break","continue","raise","del","is","global","nonlocal","print"],
    javascript: ["const","let","var","function","return","if","else","for","while","class","import","export","from","async","await","new","this","typeof","instanceof","try","catch","finally","throw","null","undefined","true","false","=>"],
    typescript: ["const","let","var","function","return","if","else","for","while","class","import","export","from","async","await","new","this","typeof","interface","type","enum","implements","extends","readonly","public","private","protected","null","undefined","true","false"],
    rust:       ["fn","let","mut","pub","use","mod","struct","impl","trait","enum","match","if","else","for","while","loop","return","self","Self","super","async","await","move","ref","const","static","type","where","in","as","Box","Option","Result","Some","None","Ok","Err"],
    cpp:        ["int","float","double","char","bool","void","if","else","for","while","do","return","class","struct","namespace","using","include","const","static","auto","new","delete","public","private","protected","virtual","true","false","nullptr","this","template","typename"],
    java:       ["public","private","protected","class","interface","extends","implements","new","return","if","else","for","while","do","static","final","void","int","float","double","char","boolean","null","true","false","this","super","import","package","try","catch","finally","throw"],
    bash:       ["if","then","else","elif","fi","for","do","done","while","case","esac","in","function","return","export","local","echo","exit","set","unset","shift","source"],
    sql:        ["SELECT","FROM","WHERE","JOIN","LEFT","RIGHT","INNER","OUTER","ON","AS","GROUP","BY","ORDER","HAVING","INSERT","INTO","VALUES","UPDATE","SET","DELETE","CREATE","TABLE","INDEX","DROP","ALTER","AND","OR","NOT","NULL","IS","IN","LIKE","BETWEEN","DISTINCT","COUNT","SUM","AVG","MAX","MIN"],
  };

  function highlightCode(src: string, lang: string): string {
    const kws = CODE_KEYWORDS[lang.toLowerCase()] || [];
    let h = escapeHtml(src);
    // strings
    h = h.replace(/(["'`])((?:(?!\1)[^\\]|\\.)*)(\1)/g, '<span class="hl-str">$1$2$3</span>');
    // comments (# and //)
    h = h.replace(/(#[^\n]*)/g, '<span class="hl-cmt">$1</span>');
    h = h.replace(/(\/\/[^\n]*)/g, '<span class="hl-cmt">$1</span>');
    // numbers
    h = h.replace(/\b(\d+\.?\d*)\b/g, '<span class="hl-num">$1</span>');
    // keywords
    for (const kw of kws) {
      h = h.replace(new RegExp(`\\b(${kw})\\b`, "g"), '<span class="hl-kw">$1</span>');
    }
    return h;
  }

  function renderCodeBlock(code: string, lang: string): string {
    const language = (lang || "text").trim().toLowerCase() || "text";
    const highlighted = highlightCode(code, language);
    // CSP is null in this app so inline onclick is safe
    return (
      `<div class="chat-code-block">` +
        `<div class="chat-code-header">` +
          `<span class="chat-lang-badge">${escapeHtml(language)}</span>` +
          `<button class="chat-copy-btn" onclick="` +
            `var b=this;` +
            `navigator.clipboard.writeText(b.closest('.chat-code-block').querySelector('code').innerText);` +
            `b.textContent='✓ Copied';` +
            `setTimeout(function(){b.textContent='⎘ Copy'},1800)` +
          `">⎘ Copy</button>` +
        `</div>` +
        `<pre><code class="hl">${highlighted}</code></pre>` +
      `</div>`
    );
  }

  function renderMath(content: string): string {
    // ── 0. Shield code blocks/spans from math processing ─────────────────────
    // Process fenced code blocks first (they may contain $...$ that must not render as math)
    const codeBlockHtml: string[] = [];
    const inlineCodeRaw: string[] = [];

    let safe = content
      .replace(/^(`{3,})([\w+\-#]*)\n([\s\S]*?)\n\1[ \t]*$/gm, (_m, _fence, lang, code) => {
        const ph = `\x02CB${codeBlockHtml.length}\x03`;
        codeBlockHtml.push(renderCodeBlock(code, lang));
        return ph;
      })
      .replace(/`([^`\n]+)`/g, (_m, code) => {
        const ph = `\x02IC${inlineCodeRaw.length}\x03`;
        inlineCodeRaw.push(code);
        return ph;
      });

    // ── 1. Display math: $$...$$ and \[...\] ─────────────────────────────────
    const displayPlaceholders: string[] = [];
    const inlinePlaceholders: string[] = [];

    const renderDisplay = (expr: string): string => {
      const rendered = katex.renderToString(expr.trim(), {
        displayMode: true,
        throwOnError: false,
        strict: "ignore",
      });
      const placeholder = `@@DM${displayPlaceholders.length}@@`;
      displayPlaceholders.push(rendered);
      return `\n\n${placeholder}\n\n`;
    };

    const renderInline = (expr: string): string => {
      const rendered = katex.renderToString(expr.trim(), {
        displayMode: false,
        throwOnError: false,
        strict: "ignore",
      });
      const placeholder = `@@IM${inlinePlaceholders.length}@@`;
      inlinePlaceholders.push(rendered);
      return placeholder;
    };

    const withDisplayMath = safe
      .replace(/\$\$([\s\S]+?)\$\$/g, (_match, expr: string) => renderDisplay(expr))
      .replace(/\\\[([\s\S]+?)\\\]/g, (_match, expr: string) => renderDisplay(expr));

    const withInlineMath = withDisplayMath
      .replace(/(^|[^\\$])\$([^\n$]+?)\$/g, (_match, prefix: string, expr: string) => `${prefix}${renderInline(expr)}`)
      .replace(/\\\((.+?)\\\)/g, (_match, expr: string) => renderInline(expr));

    // ── 2. Parse remaining markdown ───────────────────────────────────────────
    let html = markdownParser.parse(normalizeMarkdownTables(withInlineMath)) as string;

    // ── 3. Restore math ───────────────────────────────────────────────────────
    displayPlaceholders.forEach((rendered, index) => {
      html = html.replace(`@@DM${index}@@`, rendered);
    });
    inlinePlaceholders.forEach((rendered, index) => {
      html = html.replace(`@@IM${index}@@`, rendered);
    });

    // ── 4. Restore code (marked may wrap placeholder in <p>…</p>) ────────────
    codeBlockHtml.forEach((rendered, i) => {
      html = html.replace(`<p>\x02CB${i}\x03</p>`, rendered);
      html = html.replace(`\x02CB${i}\x03`, rendered); // fallback
    });
    inlineCodeRaw.forEach((code, i) => {
      html = html.replace(`\x02IC${i}\x03`, `<code>${escapeHtml(code)}</code>`);
    });

    return html;
  }

  function parseMessageContent(rawContent: string): { thinking: string; answer: string; isThinking: boolean } {
    const thinkStart = rawContent.indexOf("<think>");
    const thinkEnd = rawContent.indexOf("</think>");

    if (thinkStart !== -1) {
      if (thinkEnd !== -1) {
        const thinking = rawContent.substring(thinkStart + 7, thinkEnd).trim();
        const answer = rawContent.substring(thinkEnd + 8).trim();
        return { thinking, answer, isThinking: false };
      } else {
        const thinking = rawContent.substring(thinkStart + 7).trim();
        return { thinking, answer: "", isThinking: true };
      }
    } else {
      return { thinking: "", answer: rawContent, isThinking: false };
    }
  }

  $: parsed = parseMessageContent(message.content || "");
  $: isThinking = parsed.isThinking;
  $: thinkingText = parsed.thinking;
  $: answerText = parsed.answer;

  let thinkingExpanded = false;

  // ONLY parse markdown when streaming is finished.
  // Parsing on every token is O(n²) and causes 80%+ CPU / 1-2s-per-word slowdown.
  $: html = (!isUser && !message.streaming)
    ? renderMath(answerText || "")
    : "";
</script>

<div class="bubble-row" class:user={isUser}>
  {#if !isUser}
    <div class="avatar">AI</div>
  {/if}
  <div class="bubble" class:user={isUser} class:ai={!isUser}>
    {#if isUser}
      <p class="user-text">{message.content}</p>
    {:else}
      {#if thinkingText}
        <div class="thinking-container" class:active={isThinking}>
          <div class="thinking-header" on:click={() => { if (!isThinking) thinkingExpanded = !thinkingExpanded; }} role="button" tabindex="0" on:keydown={(e) => (e.key === ' ' || e.key === 'Enter') && !isThinking && (thinkingExpanded = !thinkingExpanded)}>
            <span class="thinking-icon">{isThinking ? "⚡" : "✓"}</span>
            <span class="thinking-title">
              {isThinking ? "Thinking..." : "Thought Process"}
            </span>
            {#if !isThinking}
              <span class="thinking-toggle-btn">{thinkingExpanded ? "Collapse ▲" : "Expand ▼"}</span>
            {/if}
          </div>
          {#if isThinking || thinkingExpanded}
            <div class="thinking-body">{thinkingText}</div>
          {/if}
        </div>
      {/if}

      {#if message.streaming}
        {#if answerText}
          <p class="streaming-text">{answerText}</p><span class="cursor" />
        {:else if isThinking}
          <span class="cursor" />
        {/if}
      {:else}
        <div class="markdown">{@html html}</div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .bubble-row {
    display: flex;
    align-items: flex-end;
    gap: 10px;
  }
  .bubble-row.user { flex-direction: row-reverse; }

  .avatar {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: .03em;
    color: #fff;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(99,102,241,.35);
  }

  .bubble {
    max-width: 78%;
    border-radius: 16px;
    padding: 10px 14px;
    font-size: 13px;
    line-height: 1.6;
  }
  .bubble.user {
    background: linear-gradient(135deg, var(--accent) 0%, #7c3aed 120%);
    color: #fff;
    border-bottom-right-radius: 4px;
    box-shadow: 0 2px 12px rgba(99,102,241,.3);
  }
  .bubble.ai {
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    color: var(--text);
    border-bottom-left-radius: 4px;
    box-shadow: var(--shadow-xs);
  }

  .user-text { white-space: pre-wrap; font-weight: 450; }
  .streaming-text { white-space: pre-wrap; margin: 0; line-height: 1.6; }

  .cursor {
    display: inline-block;
    width: 7px;
    height: 15px;
    background: var(--accent-h);
    border-radius: 2px;
    animation: blink .9s step-end infinite;
    margin-left: 3px;
    vertical-align: text-bottom;
    opacity: .85;
  }
  @keyframes blink { 50% { opacity: 0; } }

  /* Markdown inside AI bubble */
  :global(.markdown p)           { margin-bottom: 9px; line-height: 1.7; }
  :global(.markdown p:last-child){ margin-bottom: 0; }
  :global(.markdown pre) {
    background: #0d0f14;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 14px 16px;
    overflow-x: auto;
    margin: 10px 0;
  }
  :global(.markdown code) {
    font-family: "Fira Code", "Cascadia Code", monospace;
    font-size: 11.5px;
    line-height: 1.6;
  }
  :global(.markdown :not(pre) > code) {
    background: rgba(99,102,241,.12);
    border: 1px solid rgba(99,102,241,.2);
    padding: 1px 6px;
    border-radius: 4px;
    color: var(--accent-h);
    font-size: 11.5px;
  }
  :global(.markdown ul, .markdown ol) { padding-left: 20px; margin-bottom: 9px; }
  :global(.markdown li) { margin-bottom: 3px; line-height: 1.65; }
  :global(.markdown h1) { font-size: 16px; font-weight: 700; color: var(--text); margin: 14px 0 6px; }
  :global(.markdown h2) { font-size: 14px; font-weight: 600; color: var(--text); margin: 12px 0 5px; }
  :global(.markdown h3) { font-size: 13px; font-weight: 600; color: var(--text-muted); margin: 10px 0 4px; }
  :global(.markdown strong) { color: #f1f5f9; font-weight: 650; }
  :global(.markdown em) { color: #a5b4fc; }
  :global(.markdown blockquote) {
    border-left: 3px solid var(--accent);
    padding: 8px 14px;
    color: var(--text-muted);
    background: var(--accent-dim);
    border-radius: 0 8px 8px 0;
    margin: 8px 0;
  }
  :global(.markdown table) { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 12px; }
  :global(.markdown thead) { background: var(--bg-active); }
  :global(.markdown th) {
    background: var(--bg-active);
    padding: 7px 12px;
    text-align: left;
    color: var(--text-muted);
    border: 1px solid var(--border);
    font-weight: 600;
  }
  :global(.markdown td) { padding: 6px 12px; color: var(--text); border: 1px solid var(--border-soft); }
  :global(.markdown tr:nth-child(even) td) { background: rgba(255,255,255,.02); }
  :global(.markdown a) { color: var(--accent-h); text-decoration: none; }
  :global(.markdown a:hover) { text-decoration: underline; }
  :global(.markdown hr) { border: none; border-top: 1px solid var(--border); margin: 16px 0; }
  :global(.markdown .katex-display) {
    overflow-x: auto;
    overflow-y: hidden;
    padding: 6px 0;
    margin: 12px 0;
  }
  :global(.markdown .katex) {
    color: var(--text);
    font-size: 1.04em;
  }

  /* ── Chat code blocks (rendered by renderCodeBlock()) ─────────────── */
  :global(.markdown .chat-code-block) {
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #2d2f36;
    margin: 10px 0;
    background: #0d0e12;
  }
  :global(.markdown .chat-code-header) {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #151619;
    padding: 5px 12px;
    border-bottom: 1px solid #2d2f36;
  }
  :global(.markdown .chat-lang-badge) {
    font-size: 10px;
    font-weight: 600;
    color: #6366f1;
    background: rgba(99,102,241,.12);
    border-radius: 4px;
    padding: 1px 7px;
  }
  :global(.markdown .chat-copy-btn) {
    margin-left: auto;
    font-size: 10px;
    background: none;
    border: 1px solid #2d2f36;
    color: #9ca3af;
    border-radius: 4px;
    padding: 2px 8px;
    cursor: pointer;
    transition: all .15s;
  }
  :global(.markdown .chat-copy-btn:hover) { color: #e5e7eb; border-color: #4b5563; }
  :global(.markdown .chat-code-block pre) {
    background: transparent;
    border: none;
    border-radius: 0;
    padding: 12px 16px;
    margin: 0;
    overflow-x: auto;
  }
  :global(.markdown .chat-code-block code.hl) {
    font-family: "Fira Code", "Cascadia Code", monospace;
    font-size: 11.5px;
    line-height: 1.6;
    color: #e2e8f0;
  }
  /* Syntax highlight token colours */
  :global(.hl-kw)  { color: #a78bfa; font-weight: 600; }
  :global(.hl-str) { color: #86efac; }
  :global(.hl-cmt) { color: #6b7280; font-style: italic; }
  :global(.hl-num) { color: #fbbf24; }

  /* Collapsible Thinking Box styles */
  .thinking-container {
    background: var(--bg-panel);
    border: 1px dashed var(--border);
    border-radius: 10px;
    margin-bottom: 12px;
    font-size: 11.5px;
    line-height: 1.5;
    overflow: hidden;
    width: 100%;
  }
  .thinking-container.active {
    border-color: rgba(99,102,241,.3);
    background: rgba(99,102,241,.02);
  }
  .thinking-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    cursor: pointer;
    user-select: none;
    outline: none;
  }
  .thinking-icon {
    font-size: 11px;
  }
  .thinking-container.active .thinking-icon {
    animation: pulse 1.2s infinite ease-in-out;
  }
  @keyframes pulse {
    0% { opacity: 0.4; transform: scale(0.95); }
    50% { opacity: 1; transform: scale(1.05); }
    100% { opacity: 0.4; transform: scale(0.95); }
  }
  .thinking-title {
    font-weight: 600;
    color: var(--text-faint);
  }
  .thinking-container.active .thinking-title {
    color: var(--accent-h);
  }
  .thinking-toggle-btn {
    margin-left: auto;
    font-size: 9.5px;
    color: var(--accent-h);
    font-weight: 600;
  }
  .thinking-body {
    padding: 0 12px 10px 12px;
    color: var(--text-faint);
    white-space: pre-wrap;
    border-top: 1px solid var(--border-soft);
    margin-top: 4px;
    padding-top: 8px;
  }
</style>
