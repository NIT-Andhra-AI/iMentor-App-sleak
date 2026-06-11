<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Chart, LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler } from "chart.js";
  import type { StatsResponse } from "../lib/api";

  Chart.register(LineController, LineElement, PointElement, LinearScale, CategoryScale, Tooltip, Filler);

  export let data: StatsResponse["sessions_per_day"];

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  onMount(() => {
    chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: data.map((d) => d.day),
        datasets: [{
          label: "Sessions",
          data: data.map((d) => d.count),
          borderColor: "#6366f1",
          backgroundColor: "rgba(99,102,241,.15)",
          fill: true,
          tension: 0.3,
          pointRadius: 4,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { tooltip: { mode: "index" } },
        scales: {
          x: { ticks: { color: "#6b7280" }, grid: { color: "#1f2128" } },
          y: { ticks: { color: "#6b7280" }, grid: { color: "#1f2128" }, beginAtZero: true },
        },
      },
    });
  });

  onDestroy(() => chart?.destroy());
</script>

<div class="wrap"><canvas bind:this={canvas}></canvas></div>

<style>
  .wrap { height: 220px; }
</style>
