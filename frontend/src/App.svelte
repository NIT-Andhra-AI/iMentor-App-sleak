<script lang="ts">
  import { onMount } from "svelte";
  import {
    sessionStore, courses, modelStatus,
    activeSidebar, showDownloader, showPrereq, consentPending,
    studyContext, ragSessionId,
    type Sidebar,
  } from "./lib/stores";
  import {
    listCourses,
    getModelStatus,
    createChatSession,
    listChatSessions,
    deleteChatSession,
    getConsentStatus,
  } from "./lib/tauri";

  import logoUrl from "./assets/logo.jpg";
  import ConsentModal     from "./components/ConsentModal.svelte";
  import PrereqCheck      from "./components/PrereqCheck.svelte";
  import ModelDownloader  from "./components/ModelDownloader.svelte";
  import CourseSelector   from "./components/CourseSelector.svelte";
  import ChatPanel        from "./components/ChatPanel.svelte";
  import SettingsPanel    from "./components/SettingsPanel.svelte";
  import DocumentUploader from "./components/DocumentUploader.svelte";
  import AgentSpawner     from "./components/AgentSpawner.svelte";
  import WikiViewer       from "./components/WikiViewer.svelte";
  import FloatingChat     from "./components/FloatingChat.svelte";

  const ICONS: Record<string, string> = {
    sessions: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
    courses:  `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    documents:`<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>`,
    agents:   `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/><line x1="12" x2="12" y1="15" y2="19"/><line x1="10" x2="14" y1="19" y2="19"/></svg>`,
    settings: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>`,
  };

  let currentSessionId: string | null = null;
  sessionStore.subscribe((s) => { currentSessionId = s.currentId; });

  let currentStudyTopic = { courseId: "", pageSlug: "", pageTitle: "" };
  studyContext.subscribe((sc) => {
    if (sc) currentStudyTopic = { courseId: sc.courseId, pageSlug: sc.pageSlug, pageTitle: sc.pageTitle };
    else currentStudyTopic = { courseId: "", pageSlug: "", pageTitle: "" };
  });

  async function newSession() {
    const id = await createChatSession("general");
    sessionStore.add({ id, title: "New chat", mode: "general", updatedAt: Date.now() });
    sessionStore.setCurrent(id);
  }

  async function deleteSession(id: string) {
    await deleteChatSession(id).catch(() => {});
    sessionStore.delete(id);

    if (!$sessionStore.currentId) {
      await newSession();
    }
  }

  async function hydrateSessions() {
    const rows = await listChatSessions(100).catch(() => []);
    if (rows.length === 0) {
      await newSession();
      return;
    }
    const sessions = rows.map((s) => ({
      id: s.id,
      title: s.title || "New chat",
      mode: s.mode || "general",
      updatedAt: Date.parse(s.updated_at) || Date.now(),
    }));
    sessionStore.setAll(sessions, sessions[0]?.id ?? null);
  }

  onMount(async () => {
    try {
      const { consent_given } = await getConsentStatus();
      consentPending.set(!consent_given);
    } catch { consentPending.set(false); }

    listCourses().then((c) => courses.set(c)).catch(console.error);

    try {
      const ms = await getModelStatus();
      modelStatus.set(ms);
      if (!ms.vcredist_ok) showPrereq.set(true);
      else if (!ms.llm_exists || !ms.embedding_exists) showDownloader.set(true);
    } catch { /* ignore */ }

    await hydrateSessions();
  });

  function setSidebar(key: string) { activeSidebar.set(key as Sidebar); }

  function refreshCourses() {
    listCourses().then((c) => courses.set(c)).catch(console.error);
  }

  function handleOpenPage(e: CustomEvent<{ courseId: string; pageSlug: string; pageTitle: string }>) {
    const { courseId, pageSlug, pageTitle } = e.detail;
    console.log("📖 [APP] 🔵 handleOpenPage RECEIVED with:", { courseId, pageSlug, pageTitle });
    studyContext.set({ courseId, pageSlug, pageTitle, pageContent: "" });
    console.log("📖 [APP] ✓ studyContext UPDATED to:", { courseId, pageSlug, pageTitle });
  }

  function handlePageLoaded(e: CustomEvent<{ slug: string; title: string; content: string }>) {
    studyContext.update(sc => sc ? { ...sc, pageContent: e.detail.content } : sc);
  }
</script>

<div class="shell">
  {#if $showPrereq}
    <PrereqCheck on:dismiss={() => {
      showPrereq.set(false);
      if ($modelStatus && (!$modelStatus.llm_exists || !$modelStatus.embedding_exists))
        showDownloader.set(true);
    }} />
  {/if}

  {#if $consentPending === true}
    <ConsentModal on:accepted={() => consentPending.set(false)}
                  on:declined={() => consentPending.set(false)} />
  {/if}

  {#if $showDownloader && $modelStatus}
    <ModelDownloader
      initialStatus={$modelStatus}
      on:ready={async () => {
        showDownloader.set(false);
        const ms = await getModelStatus().catch(() => null);
        if (ms) modelStatus.set(ms);
      }}
    />
  {/if}

  <!-- Icon nav -->
  <nav class="nav-bar">
    <div class="nav-logo" title="Student AI">
      <img src={logoUrl} alt="Student AI" class="logo-img" />
    </div>
    {#each ["sessions","courses","agents"] as key}
      <button
        class="nav-btn"
        class:active={$activeSidebar === key}
        title={key}
        on:click={() => setSidebar(key)}
      >
        {@html ICONS[key]}
      </button>
    {/each}
    <div class="spacer" />
    <button class="nav-btn" class:active={$activeSidebar === "settings"}
            title="Settings" on:click={() => activeSidebar.set("settings")}>
      {@html ICONS.settings}
    </button>
    <div class="nav-bottom-pad" />
  </nav>

  <!-- ── Sessions layout ────────────────────────────────────────────────── -->
  {#if $activeSidebar === "sessions"}
    <aside class="sidebar">
      <div class="sidebar-header">
        <span>Sessions</span>
        <button class="btn-accent" on:click={newSession}>+ New</button>
      </div>
      <div class="session-list">
        {#each $sessionStore.sessions as s (s.id)}
          <div
            class="session-item"
            class:active={s.id === $sessionStore.currentId}
          >
            <button class="session-btn" on:click={() => sessionStore.setCurrent(s.id)}>
              <div class="truncate">{s.title}</div>
              <div class="session-mode">{s.mode}</div>
            </button>
            <button class="del-session" title="Delete session" on:click={() => deleteSession(s.id)}>×</button>
          </div>
        {/each}
      </div>
      {#if $modelStatus && !$modelStatus.llm_loaded}
        <div class="warn-bar">
          {#if $modelStatus.llm_exists}Loading model…{:else}Downloading models…{/if}
        </div>
      {/if}
      {#if $modelStatus?.gpu_enabled}
        <div class="gpu-bar">⚡ GPU Accelerated</div>
      {/if}
    </aside>
    <main class="main-area">
      <div class="chat-col">
        {#if currentSessionId}
          <ChatPanel sessionId={currentSessionId} mode={{ type: "general" }} />
        {/if}
      </div>
    </main>

  <!-- ── Courses layout ─────────────────────────────────────────────────── -->
  {:else if $activeSidebar === "courses"}
    <aside class="sidebar">
      <CourseSelector
        courses={$courses}
        on:openPage={handleOpenPage}
        on:coursesChanged={refreshCourses}
      />
    </aside>
    <main class="main-area">
      <div class="study-area">
        <div class="wiki-pane">
          <WikiViewer
            courseId={$studyContext?.courseId ?? null}
            pageSlug={$studyContext?.pageSlug ?? ""}
            on:pageLoaded={handlePageLoaded}
          />
        </div>
      </div>
    </main>



  <!-- ── Agents layout ─────────────────────────────────────────────────── -->
  {:else if $activeSidebar === "agents"}
    <aside class="sidebar">
      <AgentSpawner on:openAgents={() => {}} />
    </aside>
    <main class="main-area">
      <div class="chat-col">
        {#if currentSessionId}
          <ChatPanel sessionId={currentSessionId} mode={{ type: "general" }} />
        {/if}
      </div>
    </main>

  <!-- ── Settings layout ───────────────────────────────────────────────── -->
  {:else if $activeSidebar === "settings"}
    <aside class="sidebar">
      <SettingsPanel modelStatus={$modelStatus} />
    </aside>
    <main class="main-area">
      <div class="chat-col">
        {#if currentSessionId}
          <ChatPanel sessionId={currentSessionId} mode={{ type: "general" }} />
        {/if}
      </div>
    </main>
  {/if}
</div>

{#if $activeSidebar === "courses" && $studyContext?.courseId && $studyContext?.pageSlug}
  <FloatingChat currentTopic={currentStudyTopic} />
{/if}

<style>
  .shell {
    display: flex;
    height: 100dvh;
    background: var(--bg);
    overflow: hidden;
  }

  /* ── Nav bar ───────────────────────────────────────────────────────────────── */
  .nav-bar {
    width: 52px;
    height: 100%;
    background: var(--bg-panel);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 8px 0;
    gap: 2px;
    flex-shrink: 0;
  }
  .nav-logo {
    width: 36px;
    height: 36px;
    margin-bottom: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .logo-img {
    width: 32px;
    height: 32px;
    object-fit: contain;
    border-radius: 6px;
  }
  .nav-btn {
    position: relative;
    width: 36px;
    height: 36px;
    border-radius: 10px;
    border: none;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 150ms ease, color 150ms ease;
  }
  .nav-btn:hover { background: var(--bg-hover); color: var(--text-muted); }
  .nav-btn.active {
    background: var(--accent-soft);
    color: var(--accent-h);
  }
  .nav-btn.active::before {
    content: "";
    position: absolute;
    left: -1px;
    top: 25%;
    height: 50%;
    width: 3px;
    background: var(--accent);
    border-radius: 0 3px 3px 0;
  }
  .spacer { flex: 1; }
  .nav-bottom-pad { height: 16px; flex-shrink: 0; }

  /* ── Sidebar ───────────────────────────────────────────────────────────────── */
  .sidebar {
    width: 248px;
    background: var(--bg-panel);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    flex-shrink: 0;
  }
  .sidebar-header {
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-muted);
    letter-spacing: .04em;
    text-transform: uppercase;
  }
  .btn-accent {
    font-size: 11px;
    font-weight: 600;
    background: var(--accent-soft);
    color: var(--accent-h);
    border: 1px solid rgba(99,102,241,.2);
    border-radius: 6px;
    padding: 3px 10px;
    cursor: pointer;
    transition: background 150ms, border-color 150ms;
    letter-spacing: .02em;
  }
  .btn-accent:hover {
    background: rgba(99,102,241,.2);
    border-color: rgba(99,102,241,.4);
  }

  /* ── Session list ──────────────────────────────────────────────────────────── */
  .session-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .session-item {
    display: flex;
    align-items: stretch;
    border-radius: 8px;
    transition: background 120ms;
  }
  .session-item.active {
    background: var(--bg-active);
  }
  .session-item:not(.active):hover { background: var(--bg-hover); }
  .session-btn {
    flex: 1;
    text-align: left;
    padding: 8px 10px;
    border: none;
    background: transparent;
    cursor: pointer;
    min-width: 0;
  }
  .truncate {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .session-item.active .truncate { color: var(--text); }
  .session-mode {
    font-size: 10px;
    color: var(--text-faint);
    margin-top: 2px;
    text-transform: capitalize;
  }
  .del-session {
    padding: 0 8px;
    border: none;
    background: transparent;
    color: var(--text-faint);
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    border-radius: 0 8px 8px 0;
    opacity: 0;
    transition: opacity 120ms, color 120ms;
  }
  .session-item:hover .del-session { opacity: 1; }
  .del-session:hover { color: var(--danger); opacity: 1; }

  /* ── Status bars ───────────────────────────────────────────────────────────── */
  .warn-bar {
    margin: 8px;
    padding: 8px 12px;
    font-size: 11px;
    color: var(--warn);
    background: rgba(245,158,11,.07);
    border: 1px solid rgba(245,158,11,.15);
    border-radius: 8px;
  }
  .gpu-bar {
    margin: 0 8px 8px;
    padding: 5px 10px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: .05em;
    color: #a78bfa;
    background: rgba(139,92,246,.07);
    border: 1px solid rgba(139,92,246,.15);
    border-radius: 8px;
    text-align: center;
  }

  /* ── Main areas ────────────────────────────────────────────────────────────── */
  .main-area { flex: 1; display: flex; overflow: hidden; min-width: 0; }
  .chat-col  { flex: 1; display: flex; flex-direction: column; min-width: 0; }

  /* ── Study area (courses tab) ──────────────────────────────────────────────── */
  .study-area {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }
  .wiki-pane {
    flex: 1;
    overflow: hidden;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>

