<script lang="ts">
  import type { StatsResponse } from "../lib/api";
  export let stats: StatsResponse;
  const cards = [
    { label: "Total Sessions",  value: () => stats.total_sessions.toLocaleString() },
    { label: "Sessions Today",  value: () => stats.sessions_today.toLocaleString() },
    { label: "Active Courses",  value: () => stats.active_courses.toLocaleString() },
    { label: "Avg TTFT",        value: () => stats.avg_ttft_ms ? `${stats.avg_ttft_ms} ms` : "—" },
  ];
</script>

<div class="grid">
  {#each cards as c}
    <div class="card">
      <div class="val">{c.value()}</div>
      <div class="lbl">{c.label}</div>
    </div>
  {/each}
</div>

<style>
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  .card {
    background: #141517; border: 1px solid #2d2f36; border-radius: 12px;
    padding: 18px 20px;
  }
  .val { font-size: 24px; font-weight: 700; color: #fff; }
  .lbl { font-size: 12px; color: #6b7280; margin-top: 4px; }
</style>
