<script lang="ts">
  import { authStore } from "../stores/authStore";
  export let tab: string;
  export let onTab: (t: string) => void;

  const TABS = [
    { id: "stats",    label: "Dashboard" },
    { id: "sessions", label: "Sessions" },
    { id: "courses",  label: "Courses" },
  ];
</script>

<header>
  <div class="brand">Student AI <span class="badge">Admin</span></div>
  <nav>
    {#each TABS as t}
      <button class:active={tab === t.id} on:click={() => onTab(t.id)}>{t.label}</button>
    {/each}
  </nav>
  <button class="logout" on:click={() => authStore.logout()}>Sign out</button>
</header>

<style>
  header {
    display: flex; align-items: center; gap: 24px;
    padding: 0 24px; height: 52px;
    background: #141517; border-bottom: 1px solid #2d2f36;
    flex-shrink: 0;
  }
  .brand { font-size: 15px; font-weight: 600; color: #fff; white-space: nowrap; }
  .badge {
    font-size: 10px; background: #6366f1; color: #fff;
    padding: 1px 6px; border-radius: 4px; margin-left: 6px; vertical-align: middle;
  }
  nav { display: flex; gap: 4px; flex: 1; }
  nav button {
    background: none; border: none; color: #9ca3af; cursor: pointer;
    padding: 6px 12px; border-radius: 6px; font-size: 13px;
    transition: background .15s, color .15s;
  }
  nav button:hover  { background: #1e2028; color: #e5e7eb; }
  nav button.active { background: #1e2028; color: #fff; font-weight: 500; }
  .logout {
    background: none; border: 1px solid #374151; color: #9ca3af;
    cursor: pointer; padding: 4px 10px; border-radius: 6px; font-size: 12px;
    transition: border-color .15s, color .15s;
  }
  .logout:hover { border-color: #6b7280; color: #e5e7eb; }
</style>
