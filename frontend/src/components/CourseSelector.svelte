<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import CourseUpdater from "./CourseUpdater.svelte";
  import { removeCourse, restoreCourse, getCourseManifest } from "../lib/tauri";
  import type { CourseInfo } from "../lib/tauri";
  import { getOrderedModules } from "../lib/courseFlow";

  export let courses: CourseInfo[];

  const dispatch = createEventDispatcher<{
    openPage: { courseId: string; pageSlug: string; pageTitle: string };
    coursesChanged: void;
  }>();

  let showUpdater = false;
  let managing = false;
  let busyId: string | null = null;
  let filterText = "";

  // Tree state
  let expandedCourse: string | null = null;
  let expandedModules = new Set<string>();
  let manifests = new Map<string, any>();

  $: activeCourses  = courses.filter((c) => !c.removed);
  $: removedCourses = courses.filter((c) => c.removed);
  $: query = filterText.trim().toLowerCase();

  $: if (query.length > 0) {
    for (const course of activeCourses) {
      void ensureManifestLoaded(course.id);
    }
  }

  async function ensureManifestLoaded(courseId: string) {
    if (manifests.has(courseId)) return;
    try {
      const m = await getCourseManifest(courseId);
      manifests.set(courseId, m);
      manifests = manifests;
    } catch {
      // Ignore lazy-load errors and keep UI responsive.
    }
  }

  async function toggleCourse(courseId: string) {
    if (expandedCourse === courseId) {
      expandedCourse = null;
      return;
    }
    expandedCourse = courseId;
    await ensureManifestLoaded(courseId);
  }

  function toggleModule(courseId: string, moduleId: string) {
    const key = `${courseId}:${moduleId}`;
    const next = new Set(expandedModules);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    expandedModules = next;
    console.log("📖 [COURSESELECTOR] expandedModules:", Array.from(expandedModules));
  }

  function pageIcon(type: string = ""): string {
    if (type === "interview") return "💼";
    if (type === "quiz")      return "📝";
    if (type === "code")      return "💻";
    if (type === "lab")       return "🧪";
    if (type === "project")   return "🚀";
    if (type === "overview")  return "🗺️";
    return "📄";
  }

  function pageMatchesQuery(page: any): boolean {
    if (!query) return true;
    const title = String(page?.title ?? "").toLowerCase();
    const slug = String(page?.slug ?? page?.id ?? "").toLowerCase();
    const type = String(page?.type ?? "").toLowerCase();
    return title.includes(query) || slug.includes(query) || type.includes(query);
  }

  function getVisibleModules(courseId: string): any[] {
    const manifest = manifests.get(courseId);
    const modules = getOrderedModules(manifest, courseId);
    if (!query) return modules;

    const filtered: any[] = [];
    for (const mod of modules) {
      const moduleTitle = String(mod?.title ?? "").toLowerCase();
      const moduleId = String(mod?.id ?? mod?.slug ?? "").toLowerCase();
      const moduleMatch = moduleTitle.includes(query) || moduleId.includes(query);
      const pages = mod?.pages ?? [];
      const matchedPages = moduleMatch ? pages : pages.filter((p: any) => pageMatchesQuery(p));
      if (moduleMatch || matchedPages.length > 0) {
        filtered.push({ ...mod, pages: matchedPages });
      }
    }
    return filtered;
  }

  function courseMatchesQuery(course: CourseInfo): boolean {
    if (!query) return true;
    const inCourseTitle = course.title.toLowerCase().includes(query) || course.id.toLowerCase().includes(query);
    if (inCourseTitle) return true;
    const modules = getVisibleModules(course.id);
    return modules.length > 0;
  }

  function filteredPageCount(courseId: string): number {
    return getVisibleModules(courseId).reduce((count, mod) => count + (mod.pages ?? []).length, 0);
  }

  async function handleRemove(course: CourseInfo) {
    busyId = course.id;
    try {
      await removeCourse(course.id);
      if (expandedCourse === course.id) expandedCourse = null;
      dispatch("coursesChanged");
    } finally {
      busyId = null;
    }
  }

  async function handleRestore(course: CourseInfo) {
    busyId = course.id;
    try {
      await restoreCourse(course.id);
      dispatch("coursesChanged");
    } finally {
      busyId = null;
    }
  }
</script>

<div class="wrap">
  {#if showUpdater}
    <div class="header">
      <button class="back-link" on:click={() => (showUpdater = false)}>← Back</button>
      <p class="title">Add / Update Courses</p>
    </div>
    <CourseUpdater on:coursesChanged={() => { dispatch("coursesChanged"); showUpdater = false; }} />

  {:else if managing}
    <!-- ── Manage mode ── -->
    <div class="header">
      <div>
        <p class="title">Manage Courses</p>
        <p class="sub">Remove or restore courses</p>
      </div>
      <button class="icon-btn active" title="Done" on:click={() => (managing = false)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </button>
    </div>

    <div class="list">
      {#if activeCourses.length > 0}
        <p class="section-label">Installed</p>
        {#each activeCourses as course (course.id)}
          <div class="manage-row">
            <div class="manage-info">
              <span class="manage-name">{course.title}</span>
              <span class="manage-meta">
                {course.wiki_page_count} pages
                {#if course.is_downloaded}<span class="badge-dl">Server</span>{:else}<span class="badge-bundled">Built-in</span>{/if}
                · v{course.version}
              </span>
            </div>
            <button
              class="action-btn danger"
              disabled={busyId === course.id}
              title="Remove course"
              on:click={() => handleRemove(course)}
            >
              {#if busyId === course.id}
                <span class="spin">↻</span>
              {:else}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              {/if}
            </button>
          </div>
        {/each}
      {/if}

      {#if removedCourses.length > 0}
        <p class="section-label" style="margin-top:12px">Removed (bundled — restorable)</p>
        {#each removedCourses as course (course.id)}
          <div class="manage-row removed-row">
            <div class="manage-info">
              <span class="manage-name muted">{course.title}</span>
              <span class="manage-meta">{course.wiki_page_count} pages · v{course.version}</span>
            </div>
            <button
              class="action-btn restore"
              disabled={busyId === course.id}
              title="Restore course"
              on:click={() => handleRestore(course)}
            >
              {#if busyId === course.id}
                <span class="spin">↻</span>
              {:else}
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/></svg>
              {/if}
            </button>
          </div>
        {/each}
      {/if}

      <div class="add-section">
        <button class="add-btn" on:click={() => { managing = false; showUpdater = true; }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="16"/><line x1="8" x2="16" y1="12" y2="12"/></svg>
          Get more courses from server
        </button>
      </div>
    </div>

  {:else}
    <!-- ── Normal tree mode ── -->
    <div class="header">
      <div>
        <p class="title">Courses</p>
      </div>
      <div class="header-actions">
        <button class="icon-btn" title="Manage courses" on:click={() => (managing = true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="4" y1="21" y2="14"/><line x1="4" x2="4" y1="10" y2="3"/><line x1="12" x2="12" y1="21" y2="12"/><line x1="12" x2="12" y1="8" y2="3"/><line x1="20" x2="20" y1="21" y2="16"/><line x1="20" x2="20" y1="12" y2="3"/><line x1="1" x2="7" y1="14" y2="14"/><line x1="9" x2="15" y1="8" y2="8"/><line x1="17" x2="23" y1="16" y2="16"/></svg>
        </button>
        <button class="icon-btn" title="Add / update courses" on:click={() => (showUpdater = true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M8 16H3v5"/>
          </svg>
        </button>
      </div>
    </div>

    <div class="search-wrap">
      <input
        class="search-input"
        type="text"
        placeholder="Search courses, modules, pages"
        bind:value={filterText}
        aria-label="Search course pages"
      />
      {#if query}
        <button class="search-clear" title="Clear search" on:click={() => (filterText = "")}>✕</button>
      {/if}
    </div>

    <div class="tree-list">
      {#if activeCourses.length === 0}
        <div class="empty">
          <p>No courses installed.</p>
          <button class="dl-link" on:click={() => (showUpdater = true)}>Get courses from server →</button>
        </div>
      {/if}

      {#each activeCourses.filter(courseMatchesQuery) as course (course.id)}
        <!-- Course row -->
        <button
          class="course-row"
          class:expanded={expandedCourse === course.id}
          on:click={() => toggleCourse(course.id)}
        >
          <span class="caret">{expandedCourse === course.id ? "▾" : "▸"}</span>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
          <span class="course-name">{course.title}</span>
          {#if query}
            <span class="filter-count">{filteredPageCount(course.id)}</span>
          {/if}
          {#if course.is_downloaded}<span class="badge-dl">DL</span>{/if}
        </button>

        {#if expandedCourse === course.id}
          {@const modules = getVisibleModules(course.id)}
          {#if manifests.get(course.id)}
            {#if modules.length === 0}
              <div class="loading-row">No matches in this course.</div>
            {/if}
            {#each modules as mod, modIndex (`${mod.id ?? mod.slug ?? mod.title ?? 'module'}:${modIndex}`)}
              {@const moduleKey = `${mod.id ?? mod.slug ?? mod.title ?? 'module'}:${modIndex}`}
              {@const expandedKey = `${course.id}:${moduleKey}`}
              {@const isExpanded = expandedModules.has(expandedKey)}
              <!-- Module row -->
              <button
                class="module-row"
                on:click|stopPropagation={() => {
                  console.log("📖 [COURSESELECTOR] Module row clicked:", { courseId: course.id, moduleKey, moduleId: mod.id, moduleTitle: mod.title });
                  toggleModule(course.id, moduleKey);
                }}
              >
                <span class="caret-sm">{isExpanded ? "▾" : "▸"}</span>
                <span class="mod-icon">{mod.icon ?? "📖"}</span>
                <span class="mod-name">{mod.title}</span>
                <span class="mod-count">{(mod.pages ?? []).length}</span>
              </button>

              {#if isExpanded}
                {#each (mod.pages ?? []) as page, pageIndex (`${page.slug ?? page.title ?? 'page'}:${pageIndex}`)}
                  <button
                    class="page-row"
                    on:click|stopPropagation={() => {
                      const resolvedSlug = page.slug ?? page.id ?? page.title;
                      if (!resolvedSlug) {
                        console.warn("📖 [COURSESELECTOR] Page missing slug/id/title; skipping openPage", { courseId: course.id, page });
                        return;
                      }
                      console.log("📖 [COURSESELECTOR] 🔵 Page CLICKED, dispatching openPage:", { courseId: course.id, pageSlug: resolvedSlug, pageTitle: page.title });
                      dispatch("openPage", {
                        courseId: course.id,
                        pageSlug: resolvedSlug,
                        pageTitle: page.title ?? String(resolvedSlug),
                      });
                      console.log("📖 [COURSESELECTOR] ✓ openPage dispatched successfully");
                    }}
                  >
                    <span class="page-icon">{pageIcon(page.type ?? "")}</span>
                    <span class="page-name">{page.title}</span>
                  </button>
                {/each}
              {/if}
            {/each}
          {:else}
            <div class="loading-row">
              <span class="spin">↻</span> Loading…
            </div>
          {/if}
        {/if}
      {/each}

      {#if activeCourses.length > 0 && activeCourses.filter(courseMatchesQuery).length === 0}
        <div class="empty">
          <p>No matches found.</p>
          <button class="dl-link" on:click={() => (filterText = "")}>Clear search →</button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .wrap  { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

  .header {
    padding: 11px 14px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }
  .title { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; }
  .sub   { font-size: 11px; color: var(--text-faint); margin-top: 3px; }
  .back-link {
    background: none;
    border: none;
    color: var(--accent-h);
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 3px 0;
  }
  .back-link:hover { color: var(--accent-h); text-decoration: underline; }

  .header-actions { display: flex; gap: 4px; }

  .search-wrap {
    border-bottom: 1px solid var(--border);
    padding: 8px 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .search-input {
    width: 100%;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg-panel);
    color: var(--text);
    font-size: 12px;
    padding: 7px 10px;
    outline: none;
    transition: border-color 120ms, box-shadow 120ms;
  }

  .search-input::placeholder {
    color: var(--text-faint);
  }

  .search-input:focus {
    border-color: rgba(99,102,241,.4);
    box-shadow: 0 0 0 2px rgba(99,102,241,.12);
  }

  .search-clear {
    width: 24px;
    height: 24px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    flex-shrink: 0;
  }
  .search-clear:hover {
    color: var(--text-muted);
    background: var(--bg-hover);
  }

  .icon-btn {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    border: none;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 150ms, color 150ms;
  }
  .icon-btn:hover  { background: var(--bg-hover); color: var(--text-muted); }
  .icon-btn.active { background: var(--accent-soft); color: var(--accent-h); }

  /* Tree */
  .tree-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px 6px;
    display: flex;
    flex-direction: column;
  }

  .course-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 7px 9px;
    border: none;
    background: transparent;
    color: var(--text-muted);
    cursor: pointer;
    border-radius: 8px;
    text-align: left;
    transition: background 120ms, color 120ms;
  }
  .course-row:hover { background: var(--bg-hover); color: var(--text); }
  .course-row.expanded { color: var(--accent-h); background: var(--accent-dim); }
  .course-name {
    flex: 1;
    font-size: 12px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    letter-spacing: -.005em;
  }

  .filter-count {
    min-width: 20px;
    padding: 1px 6px;
    border-radius: 10px;
    background: var(--bg-active);
    color: var(--text-faint);
    font-size: 9px;
    font-weight: 700;
    text-align: center;
    flex-shrink: 0;
  }
  .caret { font-size: 10px; color: var(--text-faint); flex-shrink: 0; width: 10px; }

  .module-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 5px 9px 5px 22px;
    border: none;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    border-radius: 6px;
    text-align: left;
    transition: background 120ms, color 120ms;
  }
  .module-row:hover { background: var(--bg-hover); color: var(--text-muted); }
  .caret-sm { font-size: 9px; color: var(--text-faint); flex-shrink: 0; width: 9px; }
  .mod-icon  { font-size: 11px; flex-shrink: 0; }
  .mod-name  {
    flex: 1;
    font-size: 10px;
    font-weight: 700;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-transform: uppercase;
    letter-spacing: .06em;
  }
  .mod-count {
    font-size: 9px;
    background: var(--bg-active);
    color: var(--text-faint);
    padding: 1px 6px;
    border-radius: 8px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .page-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 4px 9px 4px 36px;
    border: none;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    text-align: left;
    border-radius: 6px;
    transition: background 100ms, color 100ms;
  }
  .page-row:hover {
    background: var(--bg-hover);
    color: var(--text-muted);
  }
  .page-icon { font-size: 10px; flex-shrink: 0; }
  .page-name {
    font-size: 11px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    line-height: 1.4;
  }

  .loading-row {
    padding: 6px 8px 6px 30px;
    font-size: 11px;
    color: var(--text-faint);
    display: flex;
    align-items: center;
    gap: 7px;
  }

  /* Manage mode */
  .list { flex: 1; overflow-y: auto; padding: 8px 6px; display: flex; flex-direction: column; gap: 2px; }
  .section-label {
    font-size: 9px;
    color: var(--text-faint);
    text-transform: uppercase;
    letter-spacing: .08em;
    font-weight: 700;
    padding: 8px 10px 4px;
  }
  .manage-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 7px 10px;
    border-radius: 8px;
    transition: background 150ms;
  }
  .manage-row:hover { background: var(--bg-hover); }
  .removed-row { opacity: .55; }
  .manage-info { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .manage-name { font-size: 12px; font-weight: 500; color: var(--text); }
  .manage-name.muted { color: var(--text-faint); }
  .manage-meta {
    font-size: 10px;
    color: var(--text-faint);
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }

  .badge-dl      { font-size: 9px; font-weight: 700; color: var(--accent-h); text-transform: uppercase; letter-spacing: .05em; }
  .badge-bundled { font-size: 9px; font-weight: 700; color: var(--text-faint); text-transform: uppercase; letter-spacing: .05em; }

  .action-btn {
    width: 28px;
    height: 28px;
    flex-shrink: 0;
    border-radius: 7px;
    border: 1px solid var(--border);
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 150ms, color 150ms, border-color 150ms;
  }
  .action-btn:disabled { opacity: .4; cursor: not-allowed; }
  .action-btn.danger  { color: var(--text-faint); }
  .action-btn.danger:hover:not(:disabled)  {
    color: var(--danger);
    border-color: rgba(248,113,113,.3);
    background: rgba(248,113,113,.07);
  }
  .action-btn.restore { color: var(--text-faint); }
  .action-btn.restore:hover:not(:disabled) {
    color: var(--success);
    border-color: rgba(52,211,153,.3);
    background: rgba(52,211,153,.07);
  }

  .add-section { padding: 12px 4px 4px; border-top: 1px solid var(--border); margin-top: 8px; }
  .add-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 9px;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent-h);
    background: var(--accent-dim);
    border: 1px dashed rgba(99,102,241,.2);
    border-radius: 10px;
    cursor: pointer;
    transition: background 150ms, border-color 150ms;
    letter-spacing: .01em;
  }
  .add-btn:hover { background: var(--accent-soft); border-color: rgba(99,102,241,.35); }

  .empty { padding: 20px 12px; text-align: center; }
  .empty p   { font-size: 12px; color: var(--text-faint); line-height: 1.6; }
  .dl-link {
    background: none;
    border: none;
    color: var(--accent-h);
    font-size: 12px;
    cursor: pointer;
    text-decoration: underline;
    margin-top: 10px;
    display: block;
  }

  .spin { display: inline-block; animation: spin .8s linear infinite; font-size: 14px; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
