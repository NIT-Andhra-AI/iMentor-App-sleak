<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { getLicenseStatus, setTelemetryEnabled, getSetting, setSetting, getSystemStats } from "../lib/tauri";
  import type { ModelStatus, LicenseStatus, SystemStats } from "../lib/tauri";
  export let modelStatus: ModelStatus | null;

  // ── Server URL setting ────────────────────────────────────────────────────
  let serverUrl = "";
  let serverUrlSaved = false;
  let serverUrlError = "";  // ── Custom system prompt ──────────────────────────────────────────
  let customPrompt = "";
  let customPromptSaved = false;  // ── Performance settings ──────────────────────────────────────────────────
  let inferenceThreads = 0;    // 0 = auto
  let inferenceNCtx    = 0;    // 0 = auto
  let perfSaved        = false;
  let restartNeeded    = false;
  let sysStats: SystemStats | null = null;
  let statsInterval: ReturnType<typeof setInterval> | null = null;
  let telemetry = true;
  let license: LicenseStatus | null = null;
  let debugEnabled = false;
  let showDebugConsole = false;
  let debugLogs: Array<{ time: string; message: string; type: 'log' | 'error' | 'warn' }> = [];

  let originalLog: typeof console.log | null = null;
  let originalWarn: typeof console.warn | null = null;
  let originalError: typeof console.error | null = null;

  function addDebugLog(type: "log" | "warn" | "error", parts: unknown[]) {
    const message = parts
      .map((part) => {
        if (typeof part === "string") return part;
        try {
          return JSON.stringify(part);
        } catch {
          return String(part);
        }
      })
      .join(" ");

    debugLogs = [
      ...debugLogs,
      { time: new Date().toLocaleTimeString(), message, type }
    ].slice(-200);
  }

  onMount(async () => {
    try { license = await getLicenseStatus(); } catch {}
    try { serverUrl = (await getSetting("imentor_server_url")) ?? ""; } catch {}
    try { customPrompt = (await getSetting("custom_system_prompt")) ?? ""; } catch {}
    try {
      const t = await getSetting("inference_threads");
      inferenceThreads = t ? parseInt(t, 10) || 0 : 0;
    } catch {}
    try {
      const c = await getSetting("inference_n_ctx");
      inferenceNCtx = c ? parseInt(c, 10) || 0 : 0;
    } catch {}

    // Live system stats — poll every 2 s
    const fetchStats = async () => { try { sysStats = await getSystemStats(); } catch {} };
    await fetchStats();
    statsInterval = setInterval(fetchStats, 2000);

    if (typeof window !== "undefined") {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      const forceDebug = new URL(window.location.href).searchParams.get("debug") === "1";
      debugEnabled = isLocalhost || forceDebug;
    }

    originalLog = console.log;
    originalWarn = console.warn;
    originalError = console.error;

    console.log = (...args: unknown[]) => {
      originalLog?.(...args);
      addDebugLog("log", args);
    };
    console.warn = (...args: unknown[]) => {
      originalWarn?.(...args);
      addDebugLog("warn", args);
    };
    console.error = (...args: unknown[]) => {
      originalError?.(...args);
      addDebugLog("error", args);
    };
  });

  onDestroy(() => {
    if (statsInterval) clearInterval(statsInterval);
    if (originalLog) console.log = originalLog;
    if (originalWarn) console.warn = originalWarn;
    if (originalError) console.error = originalError;
  });

  function toggleDebugConsole() {
    showDebugConsole = !showDebugConsole;
    if (showDebugConsole) {
      debugLogs = [
        ...debugLogs,
        { time: new Date().toLocaleTimeString(), message: "Debug console opened", type: "log" as const }
      ].slice(-100);
    }
    console.log("[DEBUG] Debug console toggled:", showDebugConsole);
  }

  async function saveServerUrl() {
    serverUrlError = "";
    const url = serverUrl.trim();
    if (!url) { serverUrlError = "URL cannot be empty."; return; }
    if (!/^https?:\/\/.+/.test(url)) { serverUrlError = "Must start with http:// or https://"; return; }
    try {
      await setSetting("imentor_server_url", url);
      serverUrl = url;
      serverUrlSaved = true;
      setTimeout(() => serverUrlSaved = false, 2000);
    } catch (e) {
      serverUrlError = "Failed to save.";
    }
  }

  async function saveCustomPrompt() {
    try {
      await setSetting("custom_system_prompt", customPrompt);
      customPromptSaved = true;
      // Notify ChatPanel so it picks up the new value without a full reload.
      window.dispatchEvent(new CustomEvent("systempromptchanged", { detail: customPrompt }));
      setTimeout(() => customPromptSaved = false, 2000);
    } catch {}
  }

  async function savePerformanceSettings() {
    try {
      await setSetting("inference_threads", inferenceThreads > 0 ? String(inferenceThreads) : "");
      await setSetting("inference_n_ctx",   inferenceNCtx    > 0 ? String(inferenceNCtx)    : "");
      perfSaved     = true;
      restartNeeded = true;
      setTimeout(() => { perfSaved = false; }, 2000);
    } catch {}
  }

  async function toggleTelemetry() {
    telemetry = !telemetry;
    // Use set_telemetry_enabled so the in-memory AtomicBool on TelemetrySender
    // is updated immediately — setSetting alone only writes to the DB and the
    // current-session flush would still send despite the user opting out.
    await setTelemetryEnabled(telemetry).catch(console.error);
  }

  function daysLabel(d: number): string {
    if (d < 0) return "Expired";
    if (d === 0) return "Today";
    return `${d} day${d === 1 ? "" : "s"}`;
  }

  $: licenseColor = !license ? "" :
       license.is_expired ? "red" :
       license.days_until_expiry <= 14 ? "amber" : "green";
</script>

<div class="wrap">
  <div class="header"><p class="title">Settings</p></div>
  <div class="body">

    <!-- System Stats -->
    <p class="section">System</p>
    <div class="card-group">
      {#if sysStats}
        {@const usedMb = sysStats.total_ram_mb - sysStats.available_ram_mb}
        {@const usedPct = Math.round((usedMb / sysStats.total_ram_mb) * 100)}
        <div class="stat-row">
          <span class="item-label">RAM Usage</span>
          <span class="stat-val">{(usedMb / 1024).toFixed(1)} / {(sysStats.total_ram_mb / 1024).toFixed(1)} GB</span>
        </div>
        <div class="ram-bar-track">
          <div class="ram-bar-fill"
               class:bar-ok={usedPct < 60}
               class:bar-warn={usedPct >= 60 && usedPct < 80}
               class:bar-crit={usedPct >= 80}
               style="width: {usedPct}%"></div>
        </div>
        <div class="stat-row" style="margin-top:8px">
          <span class="item-label">CPU Threads</span>
          <span class="stat-val">{sysStats.cpu_threads} logical</span>
        </div>
        <div class="stat-row">
          <span class="item-label">RAM Free</span>
          <span class="stat-val">{(sysStats.available_ram_mb / 1024).toFixed(1)} GB available</span>
        </div>
        <div class="stat-row" style="margin-top:12px; border-top:1px solid var(--border); padding-top:10px">
          <span class="item-label">App RAM</span>
          <span class="stat-val">{(sysStats.app_ram_mb / 1024).toFixed(2)} GB</span>
        </div>
        <div class="stat-row">
          <span class="item-label">App CPU</span>
          <span class="stat-val" title="{sysStats.app_cpu_pct.toFixed(1)}% aggregate across {sysStats.cpu_threads} threads">{(sysStats.app_cpu_pct / sysStats.cpu_threads).toFixed(0)}% of all cores</span>
        </div>
      {:else}
        <p class="item-sub">Loading…</p>
      {/if}
    </div>

    <!-- Server -->
    <p class="section">Inference Server</p>
    <div class="card-group">
      <div class="server-row">
        <p class="item-label">Server URL</p>
        <p class="item-sub">iMentor server address (e.g. https://172.180.14.125)</p>
        <div class="server-input-row">
          <input
            class="server-input"
            type="text"
            placeholder="https://your-server-ip"
            bind:value={serverUrl}
            on:keydown={(e) => e.key === 'Enter' && saveServerUrl()}
          />
          <button class="save-btn" class:saved={serverUrlSaved} on:click={saveServerUrl}>
            {serverUrlSaved ? "Saved ✓" : "Save"}
          </button>
        </div>
        {#if serverUrlError}
          <p class="url-error">{serverUrlError}</p>
        {/if}
      </div>
    </div>

    <!-- Models -->
    <p class="section">AI Models</p>
    <div class="card-group">
      <div class="row-item">
        <span class="item-label">Language Model</span>
        <span class="status-dot"
              class:green={modelStatus?.llm_loaded}
              class:amber={modelStatus?.llm_exists && !modelStatus?.llm_loaded}
              class:red={!modelStatus?.llm_exists}>
          {modelStatus?.llm_loaded ? "●" : modelStatus?.llm_exists ? "◑" : "○"}
        </span>
      </div>
      <div class="row-item">
        <span class="item-label">Document Search</span>
        <span class="status-dot" class:green={modelStatus?.embedding_exists} class:red={!modelStatus?.embedding_exists}>
          {modelStatus?.embedding_exists ? "●" : "○"}
        </span>
      </div>
      {#if modelStatus}
        <p class="ram-note">RAM available: {(modelStatus.available_ram_mb / 1024).toFixed(1)} GB</p>
      {/if}
    </div>

    <!-- AI Behavior -->
    <p class="section">AI Behavior</p>
    <div class="card-group">
      <div class="prompt-row">
        <p class="item-label">Custom System Prompt</p>
        <p class="item-sub">Replaces the default instructions. Leave blank to use the built-in prompt.</p>
        <textarea
          class="prompt-textarea"
          placeholder="e.g. Always answer concisely with Python code examples."
          bind:value={customPrompt}
          rows={4}
        />
        <button class="save-btn" class:saved={customPromptSaved} on:click={saveCustomPrompt}>
          {customPromptSaved ? "Saved ✓" : "Save"}
        </button>
      </div>
    </div>

    <!-- Performance (requires restart) -->
    <p class="section">Performance</p>
    <div class="card-group">
      {#if restartNeeded}
        <div class="restart-banner">⚠ Restart the app to apply changes</div>
      {/if}
      <div class="perf-row">
        <div class="perf-labels">
          <p class="item-label">CPU Threads</p>
          <p class="item-sub">Inference parallelism. More threads = faster but uses more CPU.{#if sysStats} Max on this device: {sysStats.cpu_threads}.{/if}</p>
        </div>
        <div class="perf-control">
          <select class="perf-select" bind:value={inferenceThreads}>
            <option value={0}>Auto (recommended)</option>
            {#each [1,2,3,4,6,8,10,12,16,20,24,32] as t}
              {#if !sysStats || t <= sysStats.cpu_threads}
                <option value={t}>{t} thread{t===1?'':'s'}</option>
              {/if}
            {/each}
          </select>
        </div>
      </div>
      <div class="perf-row" style="margin-top:6px">
        <div class="perf-labels">
          <p class="item-label">Context Window</p>
          <p class="item-sub">Conversation memory size. Smaller = less RAM used. Larger = remembers more context.</p>
        </div>
        <div class="perf-control">
          <select class="perf-select" bind:value={inferenceNCtx}>
            <option value={0}>Auto (recommended)</option>
            <option value={512}>512 tokens — minimal RAM</option>
            <option value={1024}>1 K tokens — light</option>
            <option value={2048}>2 K tokens — balanced</option>
            <option value={4096}>4 K tokens — standard</option>
            <option value={8192}>8 K tokens — extended</option>
          </select>
        </div>
      </div>
      <button class="save-btn" style="align-self:flex-end;margin-top:4px"
              class:saved={perfSaved} on:click={savePerformanceSettings}>
        {perfSaved ? "Saved ✓" : "Save"}
      </button>
    </div>

    <!-- Privacy -->
    <p class="section">Privacy</p>
    <div class="card-group">
      <div class="row-item">
        <div>
          <p class="item-label">Send anonymous usage data</p>
          <p class="item-sub">De-identified sessions only</p>
        </div>
        <button class="toggle" class:on={telemetry} on:click={toggleTelemetry}>
          <span class="knob" />
        </button>
      </div>
    </div>

    <!-- Model paths hidden intentionally — no technical model names exposed to users -->
    
    <p class="section">License</p>
    <div class="card-group">
      {#if license}
        <!-- Warning banner -->
        {#if license.warning_message}
          <div class="warn-banner">{license.warning_message}</div>
        {/if}

        <div class="row-item">
          <span class="item-label">Status</span>
          <span class="status-dot" class:green={licenseColor==='green'}
                class:amber={licenseColor==='amber'} class:red={licenseColor==='red'}>
            {license.is_expired ? "● Expired" : `● Active`}
          </span>
        </div>
        <div class="row-item">
          <span class="item-label">Expires in</span>
          <span class="item-sub" class:warn={license.days_until_expiry <= 14}>
            {daysLabel(license.days_until_expiry)}
          </span>
        </div>
        <div class="row-item">
          <span class="item-label">Installed</span>
          <span class="item-sub">{license.days_since_install} day{license.days_since_install===1?"":"s"} ago</span>
        </div>
        <div class="row-item">
          <span class="item-label">Last online sync</span>
          <span class="item-sub" class:warn={license.days_since_poll > 20}>
            {license.days_since_poll === 0 ? "Today" : `${license.days_since_poll} day${license.days_since_poll===1?"":"s"} ago`}
          </span>
        </div>
        <p class="item-sub" style="padding-top:4px">
          Auto-removes after {license.max_install_days} days or {license.inactivity_days} days offline (whichever is sooner).
        </p>
      {:else}
        <p class="item-sub">Loading license info…</p>
      {/if}
    </div>

    <!-- Debug Tools (hidden in production) -->
    {#if debugEnabled}
      <p class="section">Debug</p>
      <div class="card-group">
        <button class="debug-btn" type="button" on:click={toggleDebugConsole}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/><path d="M12 6v6l4 2.5"/></svg>
          {showDebugConsole ? 'Hide' : 'Show'} Debug Console
        </button>
        
        {#if showDebugConsole}
          <div class="debug-console">
            <div class="console-header">Debug Console (Last 50 logs)</div>
            <div class="console-content">
              {#each debugLogs.slice(-50) as log (log)}
                <div class="console-line" class:error={log.type === 'error'} class:warn={log.type === 'warn'}>
                  <span class="time">[{log.time}]</span>
                  <span class="message">{log.message}</span>
                </div>
              {/each}
              {#if debugLogs.length === 0}
                <div class="console-line empty">No logs yet...</div>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .wrap   { display: flex; flex-direction: column; height: 100%; }
  .header { padding: 12px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .title  { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; }
  .body   { padding: 14px 12px; display: flex; flex-direction: column; gap: 12px; overflow-y: auto; }
  .section {
    font-size: 9px; font-weight: 700; color: var(--text-faint);
    text-transform: uppercase; letter-spacing: .08em;
    padding: 4px 2px 0;
  }
  .card-group {
    background: var(--bg-elevated); border: 1px solid var(--border);
    border-radius: 10px; padding: 10px 12px;
    display: flex; flex-direction: column; gap: 8px;
  }
  .row-item { display: flex; align-items: center; justify-content: space-between; }
  .item-label { font-size: 12px; color: var(--text); font-weight: 500; }
  .item-sub   { font-size: 11px; color: var(--text-faint); }
  .ram-note   { font-size: 10px; color: var(--text-faint); padding: 0 2px; }
  .status-dot { font-size: 13px; }
  .status-dot.green { color: var(--success); }
  .status-dot.amber { color: var(--warning); }
  .status-dot.red   { color: var(--danger); }
  /* Toggle */
  .toggle {
    width: 36px; height: 20px; border-radius: 999px; border: none; cursor: pointer;
    background: var(--border); position: relative; transition: background 200ms; flex-shrink: 0;
  }
  .toggle.on { background: var(--accent); box-shadow: 0 0 8px rgba(99,102,241,.35); }
  .knob {
    position: absolute; top: 2px; left: 2px; width: 16px; height: 16px;
    border-radius: 50%; background: #fff; transition: transform 200ms;
    box-shadow: 0 1px 3px rgba(0,0,0,.4);
  }
  .toggle.on .knob { transform: translateX(16px); }
  .warn-banner {
    background: rgba(127,29,29,.5); color: #fca5a5;
    border: 1px solid rgba(248,113,113,.2);
    border-radius: 8px; padding: 8px 10px;
    font-size: 11px; line-height: 1.6;
  }
  .item-sub.warn { color: var(--warning); }
  /* System stats */
  .stat-row { display: flex; justify-content: space-between; align-items: center; padding: 2px 0; }
  .stat-val { font-size: 11px; font-weight: 600; color: var(--text); font-variant-numeric: tabular-nums; }
  .ram-bar-track {
    width: 100%; height: 6px; background: var(--bg-elevated, #e5e7eb);
    border-radius: 3px; overflow: hidden; margin: 4px 0 0;
  }
  .ram-bar-fill { height: 100%; border-radius: 3px; transition: width 600ms ease; }
  .bar-ok   { background: var(--success, #22c55e); }
  .bar-warn { background: var(--warning, #f59e0b); }
  .bar-crit { background: var(--danger,  #ef4444); }
  /* Server URL */
  .server-row { display: flex; flex-direction: column; gap: 4px; }
  .server-input-row { display: flex; gap: 6px; align-items: center; }
  .server-input {
    flex: 1; padding: 6px 8px; border: 1px solid var(--border); border-radius: 6px;
    background: var(--bg); color: var(--text); font-size: 11px;
    outline: none; transition: border-color 150ms;
  }
  .server-input:focus { border-color: var(--accent); }
  /* Prompt textarea */
  .prompt-row { display: flex; flex-direction: column; gap: 6px; }
  .prompt-textarea {
    width: 100%; padding: 7px 9px; border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg); color: var(--text); font-size: 11px; font-family: inherit;
    line-height: 1.55; resize: vertical; min-height: 72px;
    outline: none; transition: border-color 150ms; box-sizing: border-box;
  }
  .prompt-textarea:focus { border-color: var(--accent); }
  .prompt-textarea::placeholder { color: var(--text-faint); }
  .save-btn {
    padding: 6px 10px; border: none; border-radius: 6px; cursor: pointer;
    background: var(--accent); color: #fff; font-size: 11px; font-weight: 600;
    transition: background 150ms; white-space: nowrap;
  }
  .save-btn:hover { background: var(--accent-hover, #4f46e5); }
  .save-btn.saved { background: var(--success); }
  .url-error { font-size: 10px; color: var(--danger); }
  /* Performance */
  .restart-banner {
    background: rgba(120,53,15,.35); color: #fbbf24;
    border: 1px solid rgba(251,191,36,.25);
    border-radius: 7px; padding: 7px 10px; font-size: 11px;
  }
  .perf-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .perf-labels { flex: 1; }
  .perf-control { flex-shrink: 0; }
  .perf-select {
    padding: 5px 8px; border: 1px solid var(--border); border-radius: 6px;
    background: var(--bg); color: var(--text); font-size: 11px;
    outline: none; cursor: pointer; min-width: 160px;
  }
  .perf-select:focus { border-color: var(--accent); }
  /* Debug button */
  .debug-btn {
    width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg); color: var(--text-muted); font-size: 11px;
    cursor: pointer; display: flex; align-items: center; gap: 6px;
    transition: background 150ms, color 150ms;
  }
  .debug-btn:hover { background: var(--bg-hover); color: var(--text); }
  
  /* Debug Console Styles */
  .debug-console {
    width: 100%; max-height: 300px; border: 1px solid var(--border); border-radius: 8px;
    background: var(--bg); display: flex; flex-direction: column; overflow: hidden;
    margin-top: 8px;
  }
  .console-header {
    padding: 6px 8px; background: var(--bg-elevated); border-bottom: 1px solid var(--border);
    font-size: 10px; font-weight: 600; color: var(--text-faint); text-transform: uppercase;
    letter-spacing: .05em;
  }
  .console-content {
    flex: 1; overflow-y: auto; padding: 6px; font-family: 'Monaco', 'Courier New', monospace;
    font-size: 10px; line-height: 1.4; color: var(--text-muted);
  }
  .console-line {
    margin-bottom: 4px; padding: 2px 4px; border-radius: 4px;
    display: flex; gap: 6px; align-items: flex-start;
  }
  .console-line.error {
    color: #f87171; background: rgba(127,29,29,.2);
  }
  .console-line.warn {
    color: #fbbf24; background: rgba(120,53,15,.2);
  }
  .console-line.empty {
    color: var(--text-faint); font-style: italic;
  }
  .time {
    flex-shrink: 0; color: var(--text-faint); font-weight: 600; min-width: 70px;
  }
  .message { flex: 1; word-break: break-word; white-space: pre-wrap; }
</style>
