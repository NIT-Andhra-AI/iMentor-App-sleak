<script lang="ts">
  /**
   * Code block with syntax highlighting, copy button, and an
   * optional animated "output" reveal (for blocks with --- output --- section).
   */
  import { onMount } from "svelte";

  export let code:     string = "";
  export let language: string = "python";

  let copied = false;
  let showOutput = false;

  // Split code from output if present
  let codeOnly: string;
  let output:   string | null = null;

  $: {
    const sep = /^---\s*output\s*---$/im;
    const idx = code.search(sep);
    if (idx !== -1) {
      codeOnly = code.slice(0, idx).trimEnd();
      output   = code.replace(sep, "").slice(idx).trim();
    } else {
      codeOnly = code;
      output   = null;
    }
  }

  async function copyCode() {
    await navigator.clipboard.writeText(codeOnly);
    copied = true;
    setTimeout(() => (copied = false), 1800);
  }

  // Simple keyword highlighter (lightweight, no heavy deps)
  const KEYWORDS: Record<string, string[]> = {
    python:  ["def","class","import","from","return","if","else","elif","for","while","in","not","and","or","True","False","None","lambda","with","as","try","except","finally","yield","async","await","pass","break","continue","raise","del","is","global","nonlocal","print"],
    javascript: ["const","let","var","function","return","if","else","for","while","class","import","export","from","async","await","new","this","typeof","instanceof","try","catch","finally","throw","null","undefined","true","false","=>"],
    rust: ["fn","let","mut","pub","use","mod","struct","impl","trait","enum","match","if","else","for","while","loop","return","self","Self","super","async","await","move","ref","const","static","type","where","in","as","Box","Option","Result","Some","None","Ok","Err"],
    typescript: ["const","let","var","function","return","if","else","for","while","class","import","export","from","async","await","new","this","typeof","interface","type","enum","implements","extends","readonly","public","private","protected","null","undefined","true","false"],
    cpp: ["int","float","double","char","bool","void","if","else","for","while","do","return","class","struct","namespace","using","include","const","static","auto","new","delete","public","private","protected","virtual","true","false","nullptr","this","template","typename"],
    java: ["public","private","protected","class","interface","extends","implements","new","return","if","else","for","while","do","static","final","void","int","float","double","char","boolean","null","true","false","this","super","import","package","try","catch","finally","throw"],
  };

  function highlight(src: string, lang: string): string {
    const kws = KEYWORDS[lang] || [];
    // escape HTML
    let h = src
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    // strings (double/single quote, simple)
    h = h.replace(/(["'`])((?:(?!\1)[^\\]|\\.)*)(\1)/g, '<span class="str">$1$2$3</span>');
    // comments
    h = h.replace(/(#[^\n]*)/g, '<span class="cmt">$1</span>');
    h = h.replace(/(\/\/[^\n]*)/g, '<span class="cmt">$1</span>');
    // numbers
    h = h.replace(/\b(\d+\.?\d*)\b/g, '<span class="num">$1</span>');
    // keywords
    for (const kw of kws) {
      h = h.replace(new RegExp(`\\b(${kw})\\b`, "g"), '<span class="kw">$1</span>');
    }
    return h;
  }

  $: highlighted = highlight(codeOnly, language.toLowerCase());
</script>

<div class="code-block">
  <div class="code-header">
    <span class="lang-badge">{language}</span>
    {#if output !== null}
      <button class="run-btn" on:click={() => showOutput = !showOutput}>
        {showOutput ? "▲ Hide output" : "▶ Show output"}
      </button>
    {/if}
    <button class="copy-btn" on:click={copyCode}>
      {copied ? "✓ Copied" : "⎘ Copy"}
    </button>
  </div>

  <pre><code>{@html highlighted}</code></pre>

  {#if showOutput && output !== null}
    <div class="output-pane">
      <span class="output-label">Output</span>
      <pre class="output-text">{output}</pre>
    </div>
  {/if}
</div>

<style>
  .code-block {
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid #2d2f36;
    margin: 12px 0;
    background: #0d0e12;
  }
  .code-header {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #151619;
    padding: 6px 12px;
    border-bottom: 1px solid #2d2f36;
  }
  .lang-badge {
    font-size: 11px; font-weight: 600; color: #6366f1;
    background: rgba(99,102,241,.12); border-radius: 4px;
    padding: 1px 7px;
  }
  .copy-btn, .run-btn {
    margin-left: auto; font-size: 11px; background: none;
    border: 1px solid #2d2f36; color: #9ca3af; border-radius: 4px;
    padding: 2px 9px; cursor: pointer; transition: all .15s;
  }
  .run-btn { color: #34d399; border-color: rgba(52,211,153,.3); margin-left: 0; }
  .copy-btn:hover, .run-btn:hover { color: #e5e7eb; border-color: #4b5563; }
  pre {
    margin: 0; padding: 14px 16px; overflow-x: auto;
    font-size: 12.5px; line-height: 1.6; font-family: "Fira Code", "Cascadia Code", monospace;
    color: #abb2bf;
  }
  :global(.code-block code .kw)  { color: #c678dd; font-weight: 600; }
  :global(.code-block code .str) { color: #98c379; }
  :global(.code-block code .cmt) { color: #5c6370; font-style: italic; }
  :global(.code-block code .num) { color: #d19a66; }

  .output-pane {
    border-top: 1px solid #2d2f36;
    background: #090a0e;
    padding: 10px 16px;
    animation: fadedown 0.2s ease;
  }
  .output-label {
    display: block; font-size: 10px; font-weight: 700;
    color: #34d399; text-transform: uppercase; letter-spacing: .06em;
    margin-bottom: 6px;
  }
  .output-text {
    margin: 0; font-size: 12px; color: #7ec99a;
    font-family: "Fira Code", monospace; line-height: 1.5;
  }
  @keyframes fadedown { from { opacity:0; transform:translateY(-5px); } to { opacity:1; transform:none; } }
</style>
