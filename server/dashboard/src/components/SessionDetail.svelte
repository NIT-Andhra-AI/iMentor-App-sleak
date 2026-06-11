<script lang="ts">
  import { getSessionDetail } from "../lib/api";
  import { toastStore } from "../stores/toastStore";

  export let sessionId: number;
  export let onClose: () => void;

  let data: unknown = null;
  let loading = true;

  async function load() {
    try {
      data = await getSessionDetail(sessionId);
    } catch (e) {
      toastStore.error(String(e));
    } finally {
      loading = false;
    }
  }

  load();
</script>

<div class="overlay" on:click|self={onClose} role="dialog" aria-modal="true">
  <div class="modal">
    <div class="modal-header">
      <span>Session #{sessionId} — de-identified payload</span>
      <button on:click={onClose}>×</button>
    </div>
    <div class="modal-body">
      {#if loading}
        <p class="muted">Loading…</p>
      {:else if data}
        <pre>{JSON.stringify(data, null, 2)}</pre>
      {:else}
        <p class="muted">No data.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay {
    position: fixed; inset: 0; z-index: 100;
    background: rgba(0,0,0,.7); display: flex; align-items: center; justify-content: center;
  }
  .modal {
    background: #1a1b1e; border: 1px solid #2d2f36; border-radius: 12px;
    width: 90%; max-width: 700px; max-height: 80vh; display: flex; flex-direction: column;
  }
  .modal-header {
    display: flex; justify-content: space-between; align-items: center;
    padding: 14px 18px; border-bottom: 1px solid #2d2f36; font-size: 13px; color: #e5e7eb;
  }
  .modal-header button {
    background: none; border: none; color: #9ca3af; font-size: 20px; cursor: pointer; line-height: 1;
  }
  .modal-body { padding: 16px 18px; overflow: auto; flex: 1; }
  pre { font-size: 11px; color: #d1d5db; white-space: pre-wrap; word-break: break-all; }
  .muted { color: #6b7280; font-size: 13px; }
</style>
