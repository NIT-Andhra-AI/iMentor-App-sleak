<script lang="ts">
  import { onMount } from "svelte";
  import { uploadDocument, listDocuments, toggleDocSelection, deleteDocument } from "../lib/tauri";
  import type { DocumentInfo } from "../lib/tauri";

  let docs: DocumentInfo[] = [];
  let uploading = false;
  let error = "";

  onMount(async () => {
    docs = await listDocuments().catch(() => []);
  });

  async function openDocumentDialog(): Promise<string | null> {
    const { invoke } = await import("@tauri-apps/api/core");
    const selected = await invoke<string | string[] | null>("plugin:dialog|open", {
      options: {
        multiple: false,
        filters: [{ name: "Documents", extensions: ["pdf", "txt"] }],
      },
    });

    return typeof selected === "string" ? selected : null;
  }

  async function handleBrowse() {
    const selected = await openDocumentDialog();
    if (!selected) return;
    uploading = true; error = "";
    try {
      const parts = selected.replace(/\\/g, "/").split("/");
      const name  = parts[parts.length - 1];
      await uploadDocument(selected, name);
      docs = await listDocuments().catch(() => docs);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    finally { uploading = false; }
  }

  async function handleToggle(doc: DocumentInfo) {
    const newVal = !doc.selected;
    try {
      await toggleDocSelection(doc.id, newVal);
      docs = docs.map(d => d.id === doc.id ? { ...d, selected: newVal } : d);
    } catch { /* ignore */ }
  }

  async function handleDelete(doc: DocumentInfo) {
    try {
      await deleteDocument(doc.id);
      docs = docs.filter(d => d.id !== doc.id);
    } catch { /* ignore */ }
  }
</script>

<div class="wrap">
  <div class="header">
    <p class="title">Documents</p>
    <p class="sub">Upload for RAG chat</p>
  </div>

  <div class="drop-zone">
    <button class="upload-btn" disabled={uploading} on:click={handleBrowse}>
      {#if uploading}
        <span class="spin">↻</span>
        <span>Processing…</span>
      {:else}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
             stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="17 8 12 3 7 8"/>
          <line x1="12" x2="12" y1="3" y2="15"/>
        </svg>
        <span>Browse or drop file</span>
      {/if}
    </button>
    <p class="hint">PDF, TXT supported</p>
    {#if error}
      <p class="err-msg">⚠ {error}</p>
    {/if}
  </div>

  {#if docs.length > 0}
    <div class="kb-header">
      <span class="kb-label">Knowledge Base</span>
      <span class="kb-hint">✓ = included in RAG</span>
    </div>
  {/if}

  <div class="doc-list">
    {#each docs as doc (doc.id)}
      <div class="doc-row">
        <label class="checkbox-wrap" title={doc.selected ? "Exclude from RAG" : "Include in RAG"}>
          <input
            type="checkbox"
            checked={doc.selected}
            on:change={() => handleToggle(doc)}
          />
        </label>
        <div class="doc-info">
          <p class="doc-name">{doc.file_name}</p>
          <p class="doc-chunks">{doc.chunk_count} chunks · {doc.word_count.toLocaleString()} words</p>
        </div>
        <button class="del-btn" title="Delete document" on:click={() => handleDelete(doc)}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"/>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
            <path d="M10 11v6"/><path d="M14 11v6"/>
          </svg>
        </button>
      </div>
    {/each}
  </div>
</div>

<style>
  .wrap  { display: flex; flex-direction: column; height: 100%; }
  .header { padding: 12px 14px; border-bottom: 1px solid var(--border); flex-shrink: 0; }
  .title { font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: .05em; }
  .sub   { font-size: 11px; color: var(--text-faint); margin-top: 3px; }

  .drop-zone { padding: 12px 12px 8px; }
  .upload-btn {
    width: 100%;
    display: flex; align-items: center; justify-content: center; gap: 8px;
    border: 2px dashed var(--border); border-radius: 12px; padding: 22px;
    background: transparent; color: var(--text-faint); cursor: pointer;
    font-size: 12px; font-weight: 500;
    transition: border-color 150ms, color 150ms, background 150ms;
  }
  .upload-btn:hover:not(:disabled) {
    border-color: rgba(99,102,241,.35);
    color: var(--accent-h);
    background: var(--accent-dim);
  }
  .upload-btn:disabled { opacity: .45; cursor: not-allowed; }
  .hint   { font-size: 10px; color: var(--text-faint); text-align: center; margin-top: 5px; letter-spacing: .02em; }
  .err-msg { font-size: 11px; color: var(--danger); margin-top: 6px; text-align: center; }

  .kb-header {
    padding: 10px 14px 5px;
    display: flex; align-items: center; justify-content: space-between;
    border-top: 1px solid var(--border);
  }
  .kb-label { font-size: 9px; font-weight: 700; color: var(--text-faint); text-transform: uppercase; letter-spacing: .08em; }
  .kb-hint  { font-size: 9px; color: var(--text-faint); }

  .doc-list { flex: 1; overflow-y: auto; padding: 0 8px 12px; display: flex; flex-direction: column; gap: 5px; }
  .doc-row  {
    display: flex; align-items: center; gap: 8px;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 9px; padding: 8px 10px;
    transition: border-color 120ms;
  }
  .doc-row:has(input:checked) { border-color: rgba(99,102,241,.25); background: var(--accent-dim); }
  .checkbox-wrap { display: flex; align-items: center; cursor: pointer; }
  .checkbox-wrap input[type="checkbox"] { width: 14px; height: 14px; accent-color: var(--accent); cursor: pointer; }
  .doc-info { flex: 1; min-width: 0; }
  .doc-name   { font-size: 11px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500; }
  .doc-chunks { font-size: 10px; color: var(--text-faint); margin-top: 2px; }
  .del-btn {
    width: 24px; height: 24px; border-radius: 6px; border: none;
    background: transparent; color: var(--text-faint); cursor: pointer; flex-shrink: 0;
    display: flex; align-items: center; justify-content: center;
    transition: color 150ms, background 150ms;
  }
  .del-btn:hover { color: var(--danger); background: rgba(248,113,113,.1); }
  .spin { display: inline-block; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>

