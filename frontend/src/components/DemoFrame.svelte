<script lang="ts">
  /**
   * Sandboxed interactive demo renderer.
   * The wiki page embeds self-contained HTML/JS visualizations inside
   * :::demo ... ::: blocks. This renders them in a sandboxed iframe using
   * a data URI so nothing can escape to the outer page.
   */
  export let html: string = "";
  export let title: string = "Interactive Demo";

  let expanded = false;
  let iframeEl: HTMLIFrameElement;

  // Wrap bare snippets in a minimal document shell
  $: docHtml = html.trimStart().startsWith("<!DOCTYPE") || html.trimStart().startsWith("<html")
    ? html
    : `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { margin:0; background:#0f1117; color:#e5e7eb; font-family: system-ui, sans-serif; font-size:13px; }
  canvas { display:block; }
</style>
</head>
<body>${html}</body>
</html>`;

  $: dataUri = `data:text/html;charset=utf-8,${encodeURIComponent(docHtml)}`;
</script>

<div class="demo-wrap" class:expanded>
  <div class="demo-header">
    <span class="demo-label">🖥️ {title}</span>
    <button class="toggle-btn" on:click={() => expanded = !expanded}>
      {expanded ? "▲ Collapse" : "▼ Expand"}
    </button>
  </div>
  {#if expanded}
    <iframe
      bind:this={iframeEl}
      src={dataUri}
      title={title}
      sandbox="allow-scripts"
      class="demo-frame"
      width="100%"
      height="380"
      frameborder="0"
    ></iframe>
  {:else}
    <div
      class="demo-preview"
      role="button"
      tabindex="0"
      on:click={() => expanded = true}
      on:keydown={e => e.key === "Enter" && (expanded = true)}
    >
      Click to launch interactive demo →
    </div>
  {/if}
</div>

<style>
  .demo-wrap {
    border: 1px solid #2d2f36;
    border-left: 3px solid #f59e0b;
    border-radius: 8px;
    overflow: hidden;
    margin: 14px 0;
    background: #0f1117;
  }
  .demo-header {
    display: flex; align-items: center; gap: 8px;
    background: #151619; padding: 7px 12px;
    border-bottom: 1px solid #2d2f36;
  }
  .demo-label { font-size: 12px; font-weight: 600; color: #f59e0b; }
  .toggle-btn {
    margin-left: auto; font-size: 11px; background: none;
    border: 1px solid #2d2f36; color: #9ca3af; border-radius: 4px;
    padding: 2px 9px; cursor: pointer;
  }
  .toggle-btn:hover { color: #f59e0b; border-color: rgba(245,158,11,.4); }
  .demo-preview {
    padding: 24px; text-align: center; color: #6b7280; font-size: 13px;
    cursor: pointer; transition: color 0.15s;
  }
  .demo-preview:hover { color: #f59e0b; }
  .demo-frame { display: block; background: #0f1117; }
</style>
