<script lang="ts">
  import { getCourses, deleteCourse } from "../lib/api";
  import type { CourseEntry } from "../lib/api";
  import { toastStore } from "../stores/toastStore";
  import CourseUpload from "./CourseUpload.svelte";

  let courses: CourseEntry[] = [];
  let loading = false;
  let showUpload = false;

  async function load() {
    loading = true;
    try {
      courses = await getCourses();
    } catch (e) {
      toastStore.error(String(e));
    } finally {
      loading = false;
    }
  }

  async function remove(id: string) {
    if (!confirm(`Delete course '${id}'? This cannot be undone.`)) return;
    try {
      await deleteCourse(id);
      toastStore.success(`Course '${id}' deleted.`);
      await load();
    } catch (e) {
      toastStore.error(String(e));
    }
  }

  function fmt(bytes: number) {
    if (bytes >= 1_048_576) return (bytes / 1_048_576).toFixed(1) + " MB";
    return (bytes / 1024).toFixed(0) + " KB";
  }

  load();
</script>

<div class="toolbar">
  <span class="total">{courses.length} courses</span>
  <button class="upload-btn" on:click={() => { showUpload = !showUpload; }}>
    {showUpload ? "Cancel" : "+ Upload Course"}
  </button>
</div>

{#if showUpload}
  <div class="upload-panel">
    <CourseUpload onDone={() => { showUpload = false; load(); }} />
  </div>
{/if}

<div class="table-wrap">
  <table>
    <thead>
      <tr><th>ID</th><th>Title</th><th>Version</th><th>Pages</th><th>Size</th><th></th></tr>
    </thead>
    <tbody>
      {#if loading}
        <tr><td colspan="6" class="center muted">Loading…</td></tr>
      {:else if courses.length > 0}
        {#each courses as c (c.id)}
          <tr>
            <td class="mono">{c.id}</td>
            <td>{c.title}</td>
            <td>{c.version}</td>
            <td>{c.wiki_page_count}</td>
            <td>{fmt(c.size_bytes)}</td>
            <td>
              <button class="del" on:click={() => remove(c.id)}>Delete</button>
            </td>
          </tr>
        {/each}
      {:else}
        <tr><td colspan="6" class="center muted">No courses in catalog.</td></tr>
      {/if}
    </tbody>
  </table>
</div>

<style>
  .toolbar {
    display: flex; align-items: center; gap: 12px; margin-bottom: 12px;
    font-size: 13px; color: #9ca3af;
  }
  .total { flex: 1; }
  .upload-btn {
    background: #6366f1; color: #fff; border: none;
    padding: 6px 14px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 500;
    transition: background .15s;
  }
  .upload-btn:hover { background: #4f46e5; }
  .upload-panel {
    background: #141517; border: 1px solid #2d2f36; border-radius: 10px;
    padding: 20px; margin-bottom: 16px;
  }
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
  .del {
    background: none; border: 1px solid #374151; color: #f87171;
    cursor: pointer; padding: 3px 8px; border-radius: 4px; font-size: 11px;
    transition: background .15s;
  }
  .del:hover { background: #7f1d1d20; }
</style>
