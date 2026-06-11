<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import {
    checkCourseUpdates, downloadCourse,
    type CourseUpdateInfo, type CourseDownloadProgress,
  } from "../lib/tauri";

  const dispatch = createEventDispatcher<{ coursesChanged: void }>();

  type CheckState = "idle" | "checking" | "done" | "error";
  type DlState    = "idle" | "downloading" | "extracting" | "done" | "error";
  interface Row { dl: DlState; progress: CourseDownloadProgress | null; error: string; }

  let checkState: CheckState = "idle";
  let checkError = "";
  let catalog: CourseUpdateInfo[] = [];
  let rows: Record<string, Row> = {};

  function fmt(bytes: number | null) {
    if (!bytes) return "";
    if (bytes >= 1_073_741_824) return (bytes / 1_073_741_824).toFixed(1) + " GB";
    if (bytes >= 1_048_576)     return (bytes / 1_048_576).toFixed(0)     + " MB";
    return (bytes / 1024).toFixed(0) + " KB";
  }

  async function handleCheck() {
    checkState = "checking"; checkError = "";
    try {
      const entries = await checkCourseUpdates();
      catalog = entries;
      const next: Record<string, Row> = {};
      for (const e of entries) {
        next[e.id] = rows[e.id] ?? { dl: "idle", progress: null, error: "" };
      }
      rows = next;
      checkState = "done";
    } catch (e) { checkError = String(e); checkState = "error"; }
  }

  async function handleDownload(courseId: string) {
    rows[courseId] = { dl: "downloading", progress: null, error: "" };
    rows = { ...rows };
    try {
      await downloadCourse(courseId, (p) => {
        if (p.done) {
          if (p.error) {
            rows[courseId] = { dl: "error", progress: p, error: p.error! };
          } else {
            rows[courseId] = { dl: "done", progress: p, error: "" };
            catalog = catalog.map((c) =>
              c.id === courseId ? { ...c, status: "current" as const, local_version: c.server_version } : c
            );
            dispatch("coursesChanged");
          }
        } else {
          rows[courseId] = {
            ...rows[courseId],
            dl: p.phase === "extracting" ? "extracting" : "downloading",
            progress: p,
          };
        }
        rows = { ...rows };
      });
    } catch (e) {
      rows[courseId] = { dl: "error", progress: null, error: String(e) };
      rows = { ...rows };
    }
  }

  $: newOrUpdated = catalog.filter((c) => c.status !== "current").length;
</script>

<div class="wrap">
  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <p class="title">Course Updates</p>
      {#if newOrUpdated > 0}
        <span class="badge">{newOrUpdated}</span>
      {/if}
    </div>
    <p class="sub">Pull new or updated courses from your server</p>
  </div>

  <!-- Check button -->
  <div class="check-section">
    <button class="check-btn" disabled={checkState === "checking"} on:click={handleCheck}>
      {#if checkState === "checking"}
        <span class="spin">↻</span> Checking server…
      {:else}
        <span style="color:#818cf8">⊕</span> Check for Updates
      {/if}
    </button>
    {#if checkState === "error"}
      <p class="err-msg">{checkError}</p>
    {/if}
  </div>

  <!-- Catalog -->
  <div class="catalog">
    {#if checkState === "idle"}
      <div class="empty-state">
        <p>Tap "Check for Updates" to see<br/>courses available on your server.</p>
      </div>
    {:else if checkState === "done" && catalog.length === 0}
      <div class="empty-state">
        <p>✓ No new courses on server yet.</p>
      </div>
    {/if}

    {#each catalog as course (course.id)}
      {@const r = rows[course.id] ?? { dl: "idle", progress: null, error: "" }}
      {@const busy = r.dl === "downloading" || r.dl === "extracting"}
      {@const canDl = course.status !== "current" || r.dl === "error"}
      <div class="course-row">
        <div class="row-top">
          <div class="row-meta">
            <div class="row-name-line">
              <span class="row-name">{course.title}</span>
              <span class="status-badge" class:new={course.status==="new"||r.dl==="done"}
                    class:update={course.status==="update" && r.dl!=="done"}
                    class:current={course.status==="current" && r.dl!=="done"}>
                {r.dl === "done" ? "✓ UP TO DATE" :
                 course.status === "new" ? "NEW" :
                 course.status === "update" ? "UPDATE" : "✓ UP TO DATE"}
              </span>
            </div>
            <p class="row-sub">
              v{course.server_version}
              {course.local_version && course.local_version !== course.server_version
                ? ` (installed: v${course.local_version})` : ""}
              {course.size_bytes ? ` · ${fmt(course.size_bytes)}` : ""}
              · {course.wiki_page_count} pages
            </p>
          </div>

          <div class="row-action">
            {#if busy}
              <span class="spin" style="color:#818cf8">↻</span>
            {:else if r.dl === "done" || (!canDl)}
              <span style="color:#4ade80">✓</span>
            {:else}
              <button class="dl-btn" on:click={() => handleDownload(course.id)}>
                {r.dl === "error" ? "Retry" : course.status === "update" ? "Update" : "Install"}
              </button>
            {/if}
          </div>
        </div>

        {#if busy && r.progress}
          <div class="prog-wrap">
            <div class="prog-bar"
                 style="width:{r.dl === 'extracting' ? 100 : Math.min(r.progress.percent,100)}%">
            </div>
          </div>
          <p class="prog-text">
            {r.dl === "extracting" ? "Extracting…" :
             r.progress.total_bytes > 0
               ? `${r.progress.percent.toFixed(0)}% of ${fmt(r.progress.total_bytes)}`
               : "Downloading…"}
          </p>
        {/if}
        {#if r.dl === "error"}
          <p class="row-err">{r.error}</p>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .wrap    { display:flex; flex-direction:column; height:100%; }
  .header  { padding:10px 12px; border-bottom:1px solid var(--border); }
  .header-left { display:flex; align-items:center; gap:8px; }
  .title   { font-size:13px; font-weight:600; color:#d1d5db; }
  .badge   { font-size:10px; background:var(--accent); color:#fff; border-radius:999px; padding:1px 6px; font-weight:700; }
  .sub     { font-size:11px; color:#6b7280; margin-top:2px; }

  .check-section { padding:10px 12px; border-bottom:1px solid var(--border); }
  .check-btn {
    width:100%; display:flex; align-items:center; justify-content:center; gap:8px;
    padding:8px; font-size:12px; font-weight:500; color:#d1d5db;
    background:var(--bg-hover); border:1px solid var(--border); border-radius:8px;
    cursor:pointer; transition:background .15s;
  }
  .check-btn:hover:not(:disabled) { background:var(--bg-active); color:#fff; }
  .check-btn:disabled { opacity:.5; cursor:not-allowed; }
  .err-msg { font-size:11px; color:#f87171; margin-top:6px; word-break:break-word; }

  .catalog   { flex:1; overflow-y:auto; padding:8px; display:flex; flex-direction:column; gap:6px; }
  .empty-state { display:flex; align-items:center; justify-content:center; height:120px; text-align:center; }
  .empty-state p { font-size:12px; color:#4b5563; }

  .course-row { background:#141517; border:1px solid var(--border); border-radius:8px; padding:10px 12px; }
  .row-top    { display:flex; gap:8px; justify-content:space-between; align-items:flex-start; }
  .row-meta   { flex:1; min-width:0; }
  .row-name-line { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .row-name   { font-size:12px; font-weight:500; color:#e5e7eb; }
  .row-sub    { font-size:10px; color:#6b7280; margin-top:2px; }
  .row-action { flex-shrink:0; }

  .status-badge { font-size:9px; font-weight:700; letter-spacing:.05em; padding:1px 5px; border-radius:3px; }
  .status-badge.new     { background:rgba(99,102,241,.15); color:#a5b4fc; border:1px solid rgba(99,102,241,.25); }
  .status-badge.update  { background:rgba(251,191,36,.1);  color:#fbbf24; border:1px solid rgba(251,191,36,.2); }
  .status-badge.current { background:rgba(74,222,128,.07); color:#4ade80; border:1px solid rgba(74,222,128,.15); }

  .dl-btn {
    font-size:11px; padding:4px 10px; background:var(--accent); color:#fff;
    border:none; border-radius:5px; cursor:pointer; font-weight:500;
    transition:background .15s;
  }
  .dl-btn:hover { background:var(--accent-h); }

  .prog-wrap { height:4px; background:#2d2f36; border-radius:999px; overflow:hidden; margin:6px 0 2px; }
  .prog-bar  { height:100%; background:var(--accent); border-radius:999px; transition:width .1s; }
  .prog-text { font-size:10px; color:#6b7280; }
  .row-err   { font-size:10px; color:#f87171; margin-top:4px; word-break:break-all; }

  .spin { display:inline-block; animation:spin .8s linear infinite; }
  @keyframes spin { to { transform:rotate(360deg); } }
</style>
