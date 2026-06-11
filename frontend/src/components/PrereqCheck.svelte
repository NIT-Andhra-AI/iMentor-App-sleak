<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { getModelStatus, installWindowsPrerequisites, openExternalUrl } from "../lib/tauri";

  const dispatch = createEventDispatcher<{ dismiss: void }>();

  const VC_URL = "https://aka.ms/vs/17/release/vc_redist.x64.exe";
  let installing = false;
  let installMessage = "";

  async function installNow() {
    if (installing) return;
    installing = true;
    installMessage = "Installing prerequisites. Please allow UAC if prompted...";

    try {
      const ok = await installWindowsPrerequisites();
      if (!ok) {
        installMessage = "Runtime is still missing. Use Download Runtime and run installer manually.";
        return;
      }

      // Re-check backend status to avoid false success notifications.
      const status = await getModelStatus().catch(() => null);
      if (status?.vcredist_ok) {
        installMessage = "Prerequisites installed successfully. Relaunching checks...";
        dispatch("dismiss");
      } else {
        installMessage = "Runtime check failed after install. Please use manual download option.";
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      installMessage = `Automatic install failed: ${message}`;
    } finally {
      installing = false;
    }
  }

  async function downloadRuntime() {
    await openExternalUrl(VC_URL).catch(console.error);
  }
</script>

<div class="overlay">
  <div class="card">
    <div class="icon">⚠</div>
    <h2>Missing System Component</h2>
    <p class="body">
      Student AI needs the <strong>Microsoft Visual C++ Runtime</strong> to run
      the AI models. It is free and takes about 30 seconds to install.
    </p>
    <ol class="steps">
      <li>Click <strong>Download Runtime</strong> below.</li>
      <li>Run the downloaded <code>vc_redist.x64.exe</code> and click <em>Install</em>.</li>
      <li>Restart Student AI once it finishes.</li>
    </ol>
    <div class="actions">
      <button class="btn-primary" on:click={installNow} disabled={installing}>
        {installing ? "Installing..." : "Install Automatically (recommended)"}
      </button>
      <button class="btn-secondary" on:click={downloadRuntime} disabled={installing}>
        Download Runtime (free, ~25 MB)
      </button>
      <button class="btn-skip" on:click={() => dispatch("dismiss")} disabled={installing}>
        Continue anyway
      </button>
    </div>
    {#if installMessage}
      <p class="status">{installMessage}</p>
    {/if}
    <p class="note">
      This only appears once. After installing, relaunch the app.
    </p>
  </div>
</div>

<style>
  .overlay {
    position: fixed; inset: 0; z-index: 100;
    display: flex; align-items: center; justify-content: center;
    background: rgba(0,0,0,.85); backdrop-filter: blur(6px);
  }
  .card {
    background: #1a1b1e; border: 1px solid #f59e0b;
    border-radius: 16px; box-shadow: 0 24px 64px rgba(0,0,0,.6);
    width: 100%; max-width: 440px; margin: 16px; padding: 32px;
    text-align: center;
  }
  .icon { font-size: 40px; margin-bottom: 12px; color: #f59e0b; }
  h2   { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 10px; }
  .body { font-size: 13px; color: #d1d5db; line-height: 1.6; margin-bottom: 16px; }
  .steps {
    text-align: left; font-size: 13px; color: #9ca3af; line-height: 1.8;
    margin: 0 0 24px; padding-left: 20px;
  }
  .steps strong { color: #e5e7eb; }
  .steps code { background: #2d2f36; border-radius: 4px; padding: 1px 5px; font-size: 12px; }
  .actions { display: flex; flex-direction: column; gap: 10px; }
  .btn-primary {
    padding: 11px 0; background: #f59e0b; color: #000;
    border: none; border-radius: 8px; font-size: 14px; font-weight: 700;
    cursor: pointer; transition: background .15s;
  }
  .btn-primary:hover { background: #fbbf24; }
  .btn-secondary {
    padding: 10px 0; background: #111827; color: #d1d5db;
    border: 1px solid #374151; border-radius: 8px; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: border-color .15s, color .15s;
  }
  .btn-secondary:hover { border-color: #4b5563; color: #f3f4f6; }
  .btn-skip {
    padding: 8px 0; background: transparent; color: #6b7280;
    border: 1px solid #374151; border-radius: 8px; font-size: 12px;
    cursor: pointer; transition: color .15s, border-color .15s;
  }
  button:disabled {
    opacity: .7;
    cursor: not-allowed;
  }
  .btn-skip:hover { color: #9ca3af; border-color: #4b5563; }
  .status {
    font-size: 12px;
    color: #d1d5db;
    margin-top: 12px;
    line-height: 1.5;
    text-align: left;
  }
  .note { font-size: 11px; color: #4b5563; margin-top: 16px; }
</style>
