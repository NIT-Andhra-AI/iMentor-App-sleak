<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { Chart, DoughnutController, ArcElement, Tooltip, Legend } from "chart.js";
  import type { StatsResponse } from "../lib/api";

  Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

  export let data: StatsResponse["mode_distribution"];

  const COLORS = ["#6366f1", "#22d3ee", "#4ade80", "#fb923c", "#f472b6"];

  let canvas: HTMLCanvasElement;
  let chart: Chart | null = null;

  onMount(() => {
    chart = new Chart(canvas, {
      type: "doughnut",
      data: {
        labels: data.map((d) => d.mode),
        datasets: [{
          data: data.map((d) => d.count),
          backgroundColor: COLORS.slice(0, data.length),
          borderColor: "#141517",
          borderWidth: 2,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#9ca3af", font: { size: 12 } } } },
      },
    });
  });

  onDestroy(() => chart?.destroy());
</script>

<div class="wrap"><canvas bind:this={canvas}></canvas></div>

<style>
  .wrap { height: 220px; }
</style>
