<script lang="ts">
  import { toastStore } from "../stores/toastStore";
</script>

<div class="toast-wrap">
  {#each $toastStore as t (t.id)}
    <div class="toast toast-{t.kind}">{t.message}</div>
  {/each}
</div>

<style>
  .toast-wrap {
    position: fixed; bottom: 20px; right: 20px; z-index: 9999;
    display: flex; flex-direction: column; gap: 8px;
  }
  .toast {
    padding: 10px 16px; border-radius: 8px; font-size: 13px;
    max-width: 380px; word-break: break-word;
    box-shadow: 0 4px 16px rgba(0,0,0,.4);
  }
  .toast-info    { background: #1e40af; color: #bfdbfe; }
  .toast-success { background: #15803d; color: #bbf7d0; }
  .toast-error   { background: #7f1d1d; color: #fca5a5; }
</style>
