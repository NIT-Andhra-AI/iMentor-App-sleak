<script lang="ts">
  import { getSessions } from "../lib/api";
  import type { SessionRow, SessionListResponse } from "../lib/api";
  import { toastStore } from "../stores/toastStore";
  import SessionDetail from "./SessionDetail.svelte";

  let page = 1;
  let modeFilter = "";
  let result: SessionListResponse | null = null;
  let loading = false;
  let detail: number | null = null;

  async function load() {
    loading = true;
    try {
      result = await getSessions(page, modeFilter || undefined);
    } catch (e) {
      toastStore.error(String(e));
    } finally {
      loading = false;
    }
  }

  function applyFilter() { page = 1; load(); }

  load();

  $: totalPages = result ? Math.ceil(result.total / result.per_page) : 1;
</script>

{#if detail !== null}
  <SessionDetail sessionId={detail} onClose={() => { detail = null; }} />
{/if}

<div class="toolbar">
  <label>
    Mode:
    <select bind:value={modeFilter} on:change={applyFilter}>
      <option value="">All</option>
      <option value="chat">chat</option>
      <option value="rag">rag</option>
      <option value="agent">agent</option>
    </select>
  </label>
  <span class="total">{result?.total ?? 0} sessions</span>
</div>

<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>ID</th><th>Session ID</th><th>Version</th>
        <th>Timestamp</th><th>Mode</th><th>Msgs</th><th></th>
      </tr>
    </thead>
    <tbody>
      {#if loading}
        <tr><td colspan="7" class="center muted">Loading…</td></tr>
      {:else if result && result.sessions.length > 0}
        {#each result.sessions as s (s.id)}
          <tr>
            <td>{s.id}</td>
            <td class="mono">{s.session_id.slice(0, 8)}…</td>
            <td>{s.app_version}</td>
            <td>{s.timestamp_utc?.slice(0, 16) ?? "—"}</td>
            <td><span class="badge">{s.mode}</span></td>
            <td>{s.message_count}</td>
            <td><button class="view" on:click={() => { detail = s.id; }}>View</button></td>
          </tr>
        {/each}
      {:else}
        <tr><td colspan="7" class="center muted">No sessions found.</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<div class="pagination">
  <button disabled={page <= 1} on:click={() => { page--; load(); }}>Prev</button>
  <span>Page {page} / {totalPages}</span>
  <button disabled={page >= totalPages} on:click={() => { page++; load(); }}>Next</button>
</div>

<style>
  .toolbar {
    display: flex; align-items: center; gap: 16px; margin-bottom: 12px;
    font-size: 13px; color: #9ca3af;
  }
  select {
    margin-left: 6px; background: #1a1b1e; border: 1px solid #2d2f36;
    color: #e5e7eb; padding: 4px 8px; border-radius: 6px; font-size: 12px;
  }
  .total { margin-left: auto; font-size: 12px; }
  .table-wrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th {
    text-align: left; padding: 8px 12px; background: #141517;
    color: #6b7280; border-bottom: 1px solid #2d2f36; font-weight: 500;
  }
  td { padding: 8px 12px; border-bottom: 1px solid #1f2128; color: #d1d5db; }
  tr:hover td { background: #161719; }
  .center { text-align: center; }
  .muted { color: #4b5563; }
  .mono { font-family: monospace; }
  .badge {
    font-size: 10px; background: #1e2028; color: #9ca3af;
    padding: 2px 6px; border-radius: 4px;
  }
  .view {
    background: none; border: 1px solid #2d2f36; color: #818cf8;
    cursor: pointer; padding: 3px 8px; border-radius: 4px; font-size: 11px;
    transition: background .15s;
  }
  .view:hover { background: #1e2028; }
  .pagination {
    display: flex; align-items: center; gap: 12px; margin-top: 12px;
    font-size: 12px; color: #6b7280;
  }
  .pagination button {
    background: #141517; border: 1px solid #2d2f36; color: #9ca3af;
    cursor: pointer; padding: 4px 10px; border-radius: 6px; font-size: 12px;
  }
  .pagination button:disabled { opacity: .4; cursor: default; }
</style>
