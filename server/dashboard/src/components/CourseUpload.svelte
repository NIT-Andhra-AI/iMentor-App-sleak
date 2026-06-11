<script lang="ts">
  import { uploadCourse } from "../lib/api";
  import { toastStore } from "../stores/toastStore";

  export let onDone: () => void;

  let courseId = "";
  let title = "";
  let description = "";
  let version = "1.0";
  let file: File | null = null;
  let progress = 0;
  let uploading = false;

  function onFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    file = input.files?.[0] ?? null;
  }

  async function submit() {
    if (!courseId || !title || !version || !file) {
      toastStore.error("Fill in all required fields and select a ZIP file.");
      return;
    }
    uploading = true;
    progress = 0;
    try {
      await uploadCourse(
        { course_id: courseId, title, description, version, bundle: file },
        (pct) => { progress = pct; }
      );
      toastStore.success(`Course '${courseId}' uploaded.`);
      onDone();
    } catch (e) {
      toastStore.error(String(e));
    } finally {
      uploading = false;
    }
  }
</script>

<form on:submit|preventDefault={submit} class="form">
  <h3>Upload Course Bundle</h3>

  <label>
    Course ID <span class="req">*</span>
    <input bind:value={courseId} placeholder="algorithms" required pattern="[a-z0-9][a-z0-9\-]{{0,63}}" />
    <small>Lowercase letters, digits, hyphens only</small>
  </label>
  <label>
    Title <span class="req">*</span>
    <input bind:value={title} placeholder="Algorithms & Data Structures" required />
  </label>
  <label>
    Description
    <textarea bind:value={description} rows="2" placeholder="Short course description…"></textarea>
  </label>
  <label>
    Version <span class="req">*</span>
    <input bind:value={version} placeholder="1.0" required />
  </label>
  <label>
    ZIP Bundle <span class="req">*</span>
    <input type="file" accept=".zip" on:change={onFileChange} required />
  </label>

  {#if uploading}
    <div class="progress-wrap">
      <div class="progress-bar" style="width:{progress}%"></div>
    </div>
    <p class="pct">{progress}%</p>
  {/if}

  <button type="submit" disabled={uploading}>
    {uploading ? "Uploading…" : "Upload"}
  </button>
</form>

<style>
  .form { display: flex; flex-direction: column; gap: 12px; max-width: 480px; }
  h3 { font-size: 14px; font-weight: 600; color: #fff; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: #9ca3af; }
  input, textarea {
    background: #141517; border: 1px solid #2d2f36; color: #e5e7eb;
    padding: 7px 10px; border-radius: 6px; font-size: 13px; outline: none;
    transition: border-color .15s;
  }
  input:focus, textarea:focus { border-color: #6366f1; }
  small { font-size: 10px; color: #4b5563; }
  .req { color: #f87171; }
  .progress-wrap { height: 5px; background: #2d2f36; border-radius: 999px; overflow: hidden; }
  .progress-bar  { height: 100%; background: #6366f1; border-radius: 999px; transition: width .2s; }
  .pct { font-size: 11px; color: #6b7280; }
  button {
    background: #6366f1; color: #fff; border: none; padding: 8px 16px;
    border-radius: 8px; cursor: pointer; font-size: 13px; font-weight: 500;
    transition: background .15s;
  }
  button:hover:not(:disabled) { background: #4f46e5; }
  button:disabled { opacity: .5; cursor: not-allowed; }
</style>
