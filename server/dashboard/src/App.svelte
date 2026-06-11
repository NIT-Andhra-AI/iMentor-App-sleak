<script lang="ts">
  import { onMount } from "svelte";
  import { authStore } from "./stores/authStore";
  import { getStats } from "./lib/api";
  import type { StatsResponse } from "./lib/api";
  import { toastStore } from "./stores/toastStore";
  import Toast from "./components/Toast.svelte";
  import Header from "./components/Header.svelte";
  import StatCards from "./components/StatCards.svelte";
  import DailyChart from "./components/DailyChart.svelte";
  import ModeChart from "./components/ModeChart.svelte";
  import SessionsTable from "./components/SessionsTable.svelte";
  import CourseTable from "./components/CourseTable.svelte";

  let loginKey = "";
  let loginBusy = false;
  let loginError = "";

  // Hash-based tab routing
  function hashTab(): string {
    const h = window.location.hash.replace("#/", "");
    return ["stats", "sessions", "courses"].includes(h) ? h : "stats";
  }
  let tab = hashTab();

  function setTab(t: string) {
    tab = t;
    window.location.hash = `#/${t}`;
  }

  window.addEventListener("hashchange", () => { tab = hashTab(); });

  // Stats data
  let stats: StatsResponse | null = null;
  let statsLoading = false;

  async function loadStats() {
    if (statsLoading) return;
    statsLoading = true;
    try {
      stats = await getStats();
    } catch (e) {
      toastStore.error(String(e));
    } finally {
      statsLoading = false;
    }
  }

  onMount(() => {
    authStore.restoreIfStored();
  });

  $: if ($authStore.authed && tab === "stats" && !stats) loadStats();

  async function login() {
    if (!loginKey.trim()) { loginError = "Enter an API key."; return; }
    loginBusy = true;
    loginError = "";
    try {
      authStore.login(loginKey.trim());
      await loadStats();
    } catch (e) {
      authStore.logout();
      loginError = "Invalid key or server error.";
    } finally {
      loginBusy = false;
    }
  }
</script>

<Toast />

{#if !$authStore.authed}
  <!-- Auth gate -->
  <div class="auth-wrap">
    <div class="auth-card">
      <h1>Student AI Admin</h1>
      <p class="sub">Enter your admin API key to continue.</p>
      <form on:submit|preventDefault={login}>
        <input
          type="password"
          bind:value={loginKey}
          placeholder="Admin API key"
          autocomplete="current-password"
        />
        {#if loginError}<p class="err">{loginError}</p>{/if}
        <button type="submit" disabled={loginBusy}>
          {loginBusy ? "Verifying…" : "Sign in"}
        </button>
      </form>
    </div>
  </div>
{:else}
  <div class="layout">
    <Header {tab} onTab={setTab} />

    <main class="content">
      {#if tab === "stats"}
        <h2 class="page-title">Dashboard</h2>
        {#if statsLoading}
          <p class="muted">Loading…</p>
        {:else if stats}
          <StatCards {stats} />
          <div class="charts">
            <div class="chart-card">
              <div class="chart-label">Sessions / day (7 d)</div>
              <DailyChart data={stats.sessions_per_day} />
            </div>
            <div class="chart-card">
              <div class="chart-label">Mode distribution</div>
              <ModeChart data={stats.mode_distribution} />
            </div>
          </div>
        {:else}
          <p class="muted">No data.</p>
        {/if}

      {:else if tab === "sessions"}
        <h2 class="page-title">Sessions</h2>
        <SessionsTable />

      {:else if tab === "courses"}
        <h2 class="page-title">Courses</h2>
        <CourseTable />
      {/if}
    </main>
  </div>
{/if}

<style>
  /* ── Auth gate ─────────────────────────────────────── */
  .auth-wrap {
    min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: #0f1117;
  }
  .auth-card {
    background: #141517; border: 1px solid #2d2f36; border-radius: 16px;
    padding: 36px; width: 360px;
  }
  h1 { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 4px; }
  .sub { font-size: 12px; color: #6b7280; margin-bottom: 20px; }
  form { display: flex; flex-direction: column; gap: 10px; }
  input[type="password"] {
    background: #0f1117; border: 1px solid #2d2f36; color: #e5e7eb;
    padding: 9px 12px; border-radius: 8px; font-size: 13px; outline: none;
    transition: border-color .15s;
  }
  input[type="password"]:focus { border-color: #6366f1; }
  .err { font-size: 11px; color: #f87171; }
  form button {
    background: #6366f1; color: #fff; border: none;
    padding: 9px; border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500;
    transition: background .15s;
  }
  form button:hover:not(:disabled) { background: #4f46e5; }
  form button:disabled { opacity: .5; cursor: not-allowed; }

  /* ── App shell ─────────────────────────────────────── */
  .layout { display: flex; flex-direction: column; height: 100vh; }
  .content { flex: 1; overflow-y: auto; padding: 24px 28px; }
  .page-title { font-size: 18px; font-weight: 600; color: #fff; margin-bottom: 18px; }
  .muted { color: #4b5563; font-size: 13px; }

  .charts {
    display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 20px;
  }
  .chart-card {
    background: #141517; border: 1px solid #2d2f36; border-radius: 12px; padding: 16px;
  }
  .chart-label { font-size: 12px; color: #6b7280; margin-bottom: 8px; }

  @media (max-width: 640px) {
    .charts { grid-template-columns: 1fr; }
  }
</style>
