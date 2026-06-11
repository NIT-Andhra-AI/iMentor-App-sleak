<script lang="ts">
  import { onMount, afterUpdate } from "svelte";
  import { createEventDispatcher } from "svelte";
  import { downloadModel, getModelStatus } from "../lib/tauri";
  import type { DownloadProgress, ModelStatus } from "../lib/tauri";

  export let initialStatus: ModelStatus;
  const dispatch = createEventDispatcher<{ ready: void }>();

  interface ModelRow { key: "llm" | "embedding"; label: string; desc: string; sizeMb: number; }
  const MODELS: ModelRow[] = [
    { key: "llm",       label: "AI Language Model",     desc: "Powers chat, course Q&A and agents",    sizeMb: 2400 },
    { key: "embedding", label: "Document Search Model", desc: "Enables search over your study notes",   sizeMb: 33   },
  ];

  type State = "idle" | "downloading" | "done" | "error";
  interface RowState { state: State; progress: DownloadProgress | null; error: string; }
  const init = (exists: boolean): RowState =>
    ({ state: exists ? "done" : "idle", progress: null, error: "" });

  let rows: Record<string, RowState> = {
    llm:       init(initialStatus.llm_exists),
    embedding: init(initialStatus.embedding_exists),
  };

  function fmt(bytes: number) {
    if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + " GB";
    if (bytes >= 1_048_576)     return (bytes / 1_048_576).toFixed(0)     + " MB";
    return (bytes / 1024).toFixed(0) + " KB";
  }

  async function startDownload(key: "llm" | "embedding") {
    rows[key] = { state: "downloading", progress: null, error: "" };
    rows = { ...rows };
    try {
      await downloadModel(key, (p) => {
        if (p.done) {
          rows[key] = p.error
            ? { state: "error", progress: p, error: p.error! }
            : { state: "done", progress: p, error: "" };
        } else {
          rows[key] = { ...rows[key], progress: p };
        }
        rows = { ...rows };
      });
    } catch (e) {
      rows[key] = { state: "error", progress: null, error: String(e) };
      rows = { ...rows };
    }
  }

  /** Start all missing (idle) models in parallel. */
  function startMissing() {
    MODELS.forEach((m) => {
      if (rows[m.key].state === "idle") startDownload(m.key);
    });
  }

  $: allDone = MODELS.every((m) => rows[m.key].state === "done");
  $: anyError = MODELS.some((m) => rows[m.key].state === "error");

  // Auto-proceed once every model is ready. Guard prevents duplicate "ready"
  // events if the reactive block fires more than once while allDone stays true.
  let readyDispatched = false;
  $: if (allDone && !readyDispatched) {
    readyDispatched = true;
    getModelStatus()
      .then((ms) => { if (ms.llm_exists && ms.embedding_exists) dispatch("ready"); })
      .catch(() => dispatch("ready"));
  }

  // Kick off downloads automatically on mount.
  onMount(() => { startMissing(); });
</script>

<div class="overlay">
  <div class="card">
    <h2>Setting up Student AI</h2>
    <p class="sub">
      Downloading the AI language model to your device. This happens once — models are never re-downloaded.
    </p>

    <div class="rows">
      {#each MODELS as m}
        {@const r = rows[m.key]}
        <div class="row">
          <div class="row-meta">
            <div class="row-title">
              {#if r.state === "done"}
                <span class="ico green">✓</span>
              {:else if r.state === "error"}
                <span class="ico red">✕</span>
              {:else if r.state === "downloading"}
                <span class="ico spin">↻</span>
              {:else}
                <span class="ico muted">○</span>
              {/if}
              <span>{m.label}</span>
            </div>
            <p class="row-desc">{m.desc}</p>
            {#if r.state === "idle"}
              <p class="row-size">~{m.sizeMb >= 1000 ? (m.sizeMb/1000).toFixed(1)+" GB" : m.sizeMb+" MB"} · queued</p>
            {:else if r.state === "downloading" && r.progress && r.progress.total_bytes > 0}
              <p class="row-size">{fmt(r.progress.bytes_done)} / {fmt(r.progress.total_bytes)}</p>
            {:else if r.state === "done"}
              <p class="row-size ready">Ready</p>
            {/if}
          </div>
          {#if r.state === "error"}
            <button class="btn-retry" on:click={() => startDownload(m.key)}>Retry</button>
          {/if}
        </div>

        {#if r.state === "downloading" && r.progress}
          {@const pct = Math.min(r.progress.percent, 100)}
          <div class="progress-wrap">
            <div class="progress-bar" style="width:{pct}%"></div>
          </div>
          <div class="progress-labels">
            <span>{pct.toFixed(0)}%</span>
            <span>{r.progress.total_bytes > 0 ? fmt(r.progress.total_bytes) : "Downloading…"}</span>
          </div>
        {/if}

        {#if r.state === "error"}
          <p class="err-msg">⚠️ Could not download. Check your internet connection and retry.</p>
        {/if}
      {/each}
    </div>

    {#if anyError}
      <p class="hint warning">⚠️ No internet connection. Connect to the internet and retry — or use the <strong>Student AI Offline Installer</strong> which includes all models and works without internet.</p>
    {:else if !allDone}
      <p class="hint">Please keep the app open. Do not close it during download.</p>
    {/if}

    <p class="note">Models are stored locally — inference runs entirely on your device.</p>
  </div>
</div>

<style>
  .overlay {
    position:fixed;inset:0;z-index:50;display:flex;align-items:center;
    justify-content:center;background:rgba(0,0,0,.75);backdrop-filter:blur(4px);
  }
  .card {
    background:#1a1b1e;border:1px solid var(--border);border-radius:16px;
    box-shadow:0 24px 64px rgba(0,0,0,.6);width:100%;max-width:460px;
    margin:16px;padding:32px;
  }
  h2 { font-size:18px;font-weight:600;color:#fff;margin-bottom:4px; }
  .sub { font-size:12px;color:#9ca3af;margin-bottom:24px;line-height:1.5; }

  .rows { display:flex;flex-direction:column;gap:10px;margin-bottom:16px; }
  .row {
    background:#141517;border:1px solid var(--border);border-radius:12px;
    padding:14px 16px;display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
  }
  .row-meta { flex:1;min-width:0; }
  .row-title { display:flex;align-items:center;gap:8px;font-size:13px;font-weight:500;color:#fff;margin-bottom:2px; }
  .row-desc  { font-size:11px;color:#6b7280;margin-bottom:4px; }
  .row-size  { font-size:11px;color:#4b5563; }
  .row-size.ready { color:#4ade80; }

  .ico { font-size:14px;font-weight:700;line-height:1; }
  .ico.green { color:#4ade80; }
  .ico.red   { color:#f87171; }
  .ico.muted { color:#4b5563; }
  .ico.spin  { color:#818cf8;display:inline-block;animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }

  .btn-retry {
    flex-shrink:0;font-size:12px;padding:5px 10px;background:#7f1d1d;color:#fca5a5;
    border:1px solid #991b1b;border-radius:6px;cursor:pointer;font-weight:500;
    transition:background .15s; align-self:center;
  }
  .btn-retry:hover { background:#991b1b; }

  .progress-wrap { height:5px;background:#2d2f36;border-radius:999px;overflow:hidden;margin:6px 0 2px; }
  .progress-bar  { height:100%;background:var(--accent);border-radius:999px;transition:width .2s; }
  .progress-labels { display:flex;justify-content:space-between;font-size:11px;color:#6b7280;margin-bottom:4px; }
  .err-msg { font-size:11px;color:#f87171;margin:4px 0; }

  .hint { font-size:11px;color:#9ca3af;margin-bottom:12px;text-align:center; }
  .hint.warning { color:#fbbf24;background:rgba(251,191,36,.08);border:1px solid rgba(251,191,36,.2);border-radius:8px;padding:8px 12px;text-align:left; }
  .note { font-size:11px;color:#4b5563;text-align:center;margin-top:12px; }
</style>
