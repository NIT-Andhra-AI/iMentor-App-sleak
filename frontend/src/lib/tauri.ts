const WEB_API_BASE = (import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

function isTauriRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean((window as any).__TAURI_INTERNALS__ || (window as any).__TAURI__);
}

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const core = await import("@tauri-apps/api/core");
  try {
    return await core.invoke<T>(cmd, args);
  } catch (err) {
    // Tauri invoke errors are often wrapped strings like:
    // "Error invoking 'upload_document': Embedding model not found..."
    // Surface only the meaningful backend message to the UI.
    const raw = err instanceof Error ? err.message : String(err);
    const cleaned = raw
      .replace(/^Error invoking\s+['"].*?['"]:\s*/i, "")
      .replace(/^Error:\s*/i, "")
      .trim();
    throw new Error(cleaned || raw);
  }
}

async function webGet<T>(path: string): Promise<T> {
  const res = await fetch(`${WEB_API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

function requireTauri(feature: string): never {
  throw new Error(`${feature} is currently available only in Tauri mode`);
}

export interface TokenEvent {
  token: string;
  done: boolean;
}

export type ChatMode =
  | { type: "general" }
  | { type: "course"; course_id: string }
  | { type: "user_docs" }
  | { type: "study_topic"; course_id: string; page_slug: string; page_content: string };

export interface ChatRequest {
  session_id: string;
  message: string;
  mode: ChatMode;
  /** `true` = force 2-stage planning; `false` = skip; absent = RAM-adaptive default */
  use_plan?: boolean;
  /** Overrides the default system prompt. Empty / absent = use default. */
  custom_system_prompt?: string;
}

export interface CourseInfo {
  id: string;
  title: string;
  description: string;
  wiki_page_count: number;
  version: string;
  /** true = downloaded from server; false = bundled with the app */
  is_downloaded: boolean;
  /** true = user has removed this course (deleted or hidden bundled) */
  removed: boolean;
}

export interface ModelStatus {
  llm_loaded: boolean;
  llm_exists: boolean;
  embedding_exists: boolean;
  available_ram_mb: number;
  /** false on Windows when VC++ 2015–2022 runtime is absent */
  vcredist_ok: boolean;
  /** true when binary was compiled with Vulkan GPU offload */
  gpu_enabled: boolean;
}

export interface SystemStats {
  available_ram_mb: number;
  total_ram_mb: number;
  cpu_threads: number;
  app_ram_mb: number;
  app_cpu_pct: number;
}

export interface AgentInfo {
  id: string;
  agent_type: "Dev" | "Test";
  status: "Idle" | "Running" | "Queued";
  message_count: number;
  created_at: string;
}

export interface StorageMessage {
  id: string;
  session_id: string;
  role: string;
  content: string;
  created_at: string;
  token_count: number | null;
  ttft_ms: number | null;
  source_refs: string | null;
}

export interface ChatSessionSummary {
  id: string;
  title: string;
  mode: string;
  updated_at: string;
}

export interface UploadResult {
  doc_id: string;
  chunk_count: number;
  word_count: number;
}

export async function chatStream(
  request: ChatRequest,
  onToken: (token: string) => void,
  onDone: () => void
): Promise<void> {
  if (!isTauriRuntime()) requireTauri("chat streaming");
  const core = await import("@tauri-apps/api/core");
  const channel = new core.Channel<TokenEvent>();
  // ── Perf timing ─────────────────────────────────────────────────────────────
  const t0 = performance.now();
  let ttft: number | null = null;
  let tokenCount = 0;
  // ─────────────────────────────────────────────────────────────────────────────
  channel.onmessage = (event) => {
    if (event.done) {
      const total = performance.now() - t0;
      const genMs = ttft !== null ? total - ttft : total;
      const toksPerSec = genMs > 0 ? (tokenCount / genMs) * 1000 : 0;
      console.log(
        `[PERF] frontend  TTFT=${ttft?.toFixed(0) ?? "?"}ms  ` +
        `tokens=${tokenCount}  throughput=${toksPerSec.toFixed(1)}tok/s  ` +
        `total=${total.toFixed(0)}ms`
      );
      onDone();
    } else {
      if (ttft === null) ttft = performance.now() - t0;
      tokenCount++;
      onToken(event.token);
    }
  };
  await tauriInvoke("chat_stream", { request, channel });
}

export async function cancelGeneration(): Promise<void> {
  if (!isTauriRuntime()) requireTauri("generation cancel");
  await tauriInvoke("cancel_generation");
}

export async function uploadDocument(filePath: string, fileName: string): Promise<UploadResult> {
  if (!isTauriRuntime()) requireTauri("document upload");
  return await tauriInvoke("upload_document", { request: { file_path: filePath, file_name: fileName } });
}

export interface DocumentInfo {
  id: string;
  file_name: string;
  chunk_count: number;
  word_count: number;
  created_at: string;
  status: string;
  selected: boolean;
}

export async function listDocuments(): Promise<DocumentInfo[]> {
  if (!isTauriRuntime()) requireTauri("document listing");
  return await tauriInvoke("list_documents");
}

export async function deleteDocument(docId: string): Promise<void> {
  if (!isTauriRuntime()) requireTauri("document deletion");
  await tauriInvoke("delete_document", { docId });
}

export async function toggleDocSelection(docId: string, selected: boolean): Promise<void> {
  if (!isTauriRuntime()) requireTauri("document selection");
  await tauriInvoke("toggle_doc_selection", { docId, selected });
}

export async function getSessionMessages(sessionId: string): Promise<StorageMessage[]> {
  if (!isTauriRuntime()) requireTauri("session messages");
  return await tauriInvoke("get_session_messages", { sessionId });
}

export async function createChatSession(mode: string = "general"): Promise<string> {
  if (!isTauriRuntime()) requireTauri("chat session creation");
  return await tauriInvoke("create_chat_session", { request: { mode } });
}

export async function listChatSessions(limit: number = 100): Promise<ChatSessionSummary[]> {
  if (!isTauriRuntime()) requireTauri("chat session listing");
  return await tauriInvoke("list_chat_sessions", { limit });
}

export async function renameChatSession(sessionId: string, title: string): Promise<void> {
  if (!isTauriRuntime()) requireTauri("chat session rename");
  await tauriInvoke("rename_chat_session", { request: { session_id: sessionId, title } });
}

export async function deleteChatSession(sessionId: string): Promise<void> {
  if (!isTauriRuntime()) requireTauri("chat session deletion");
  await tauriInvoke("delete_chat_session", { request: { session_id: sessionId } });
}

export async function getWikiPage(courseId: string, pageSlug: string): Promise<string> {
  if (!isTauriRuntime()) requireTauri("course wiki page access");
  return await tauriInvoke("get_wiki_page", { courseId, pageSlug });
}

/** Download an external image URL via the Tauri backend and cache it on disk.
 *  Returns the absolute local file path which must be passed to `convertFileSrc`
 *  before use in an `<img src>`. Throws if the download fails. */
export async function fetchImageCached(url: string): Promise<string> {
  if (!isTauriRuntime()) throw new Error("Not in Tauri runtime");
  return await tauriInvoke("fetch_image_cached", { url });
}

export async function listWikiPages(courseId: string): Promise<string[]> {
  if (!isTauriRuntime()) requireTauri("course wiki listing");
  return await tauriInvoke("list_wiki_pages", { courseId });
}

export async function getCourseManifest(courseId: string): Promise<any> {
  if (!isTauriRuntime()) requireTauri("course manifest access");
  return await tauriInvoke("get_course_manifest", { courseId });
}

export async function listCourses(): Promise<CourseInfo[]> {
  if (!isTauriRuntime()) requireTauri("course listing");
  return await tauriInvoke("list_courses");
}

export async function removeCourse(courseId: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await tauriInvoke("remove_course", { courseId });
}

export async function restoreCourse(courseId: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await tauriInvoke("restore_course", { courseId });
}

export async function getModelStatus(): Promise<ModelStatus> {
  if (!isTauriRuntime()) requireTauri("model status");
  return await tauriInvoke("get_model_status");
}

export async function getSystemStats(): Promise<SystemStats> {
  if (!isTauriRuntime()) {
    // Dev-mode mock: return plausible values
    return { available_ram_mb: 6144, total_ram_mb: 16384, cpu_threads: 8, app_ram_mb: 512, app_cpu_pct: 2.5 };
  }
  return await tauriInvoke("get_system_stats");
}

export async function getSetting(key: string): Promise<string | null> {
  if (isTauriRuntime()) {
    return await tauriInvoke("get_setting", { key });
  }
  return localStorage.getItem(`studentai:${key}`);
}

export async function setSetting(key: string, value: string): Promise<void> {
  if (isTauriRuntime()) {
    await tauriInvoke("set_setting", { key, value });
    return;
  }
  localStorage.setItem(`studentai:${key}`, value);
}

export async function getConsentStatus(): Promise<{ consent_given: boolean }> {
  if (isTauriRuntime()) {
    return tauriInvoke("get_consent_status");
  }
  return { consent_given: true };
}

export async function acceptConsent(): Promise<void> {
  if (isTauriRuntime()) {
    await tauriInvoke("accept_consent");
    return;
  }
  localStorage.setItem("studentai:consent_given", "1");
}

export async function declineConsent(): Promise<void> {
  if (isTauriRuntime()) {
    await tauriInvoke("decline_consent");
    return;
  }
  localStorage.setItem("studentai:consent_given", "0");
}

export async function openExternalUrl(url: string): Promise<void> {
  if (isTauriRuntime()) {
    await tauriInvoke("open_url", { url });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function installWindowsPrerequisites(): Promise<boolean> {
  if (isTauriRuntime()) {
    return await tauriInvoke("install_windows_prerequisites");
  }
  return false;
}

export async function setTelemetryEnabled(enabled: boolean): Promise<void> {
  if (isTauriRuntime()) {
    await tauriInvoke("set_telemetry_enabled", { enabled });
    return;
  }
  localStorage.setItem("studentai:telemetry_enabled", enabled ? "1" : "0");
}

export async function spawnAgent(agentType: "dev" | "test"): Promise<string> {
  if (!isTauriRuntime()) requireTauri("agent spawn");
  return await tauriInvoke("spawn_agent", { request: { agent_type: agentType } });
}

export async function agentMessage(
  agentId: string,
  message: string,
  onToken: (token: string) => void,
  onDone: () => void
): Promise<void> {
  if (!isTauriRuntime()) requireTauri("agent messaging");
  const core = await import("@tauri-apps/api/core");
  const channel = new core.Channel<TokenEvent>();
  channel.onmessage = (event) => {
    if (event.done) onDone();
    else onToken(event.token);
  };
  await tauriInvoke("agent_message", { agentId, message, channel });
}

export async function listAgents(): Promise<AgentInfo[]> {
  if (!isTauriRuntime()) requireTauri("agent listing");
  return await tauriInvoke("list_agents");
}

export async function removeAgent(agentId: string): Promise<void> {
  if (!isTauriRuntime()) requireTauri("agent removal");
  await tauriInvoke("remove_agent", { agentId });
}

// ── Model download ────────────────────────────────────────────────────────────

export interface DownloadProgress {
  model_type: string;
  bytes_done: number;
  total_bytes: number;
  percent: number;
  done: boolean;
  error: string | null;
}

export async function downloadModel(
  modelType: "llm" | "embedding",
  onProgress: (p: DownloadProgress) => void
): Promise<void> {
  if (!isTauriRuntime()) requireTauri("model download");
  const core = await import("@tauri-apps/api/core");
  const channel = new core.Channel<DownloadProgress>();
  channel.onmessage = onProgress;
  return tauriInvoke("download_model", { modelType, channel });
}

// ── Course updates ────────────────────────────────────────────────────────────

export interface CourseUpdateInfo {
  id: string;
  title: string;
  description: string;
  server_version: string;
  /** null = not installed locally */
  local_version: string | null;
  wiki_page_count: number;
  /** null = server did not report a size */
  size_bytes: number | null;
  /** "new" | "update" | "current" */
  status: "new" | "update" | "current";
}

export interface CourseDownloadProgress {
  course_id: string;
  bytes_done: number;
  total_bytes: number;
  percent: number;
  /** "downloading" | "extracting" | "done" */
  phase: "downloading" | "extracting" | "done";
  done: boolean;
  error: string | null;
}

export async function checkCourseUpdates(): Promise<CourseUpdateInfo[]> {
  if (!isTauriRuntime()) return [];
  return await tauriInvoke("check_course_updates");
}

export async function downloadCourse(
  courseId: string,
  onProgress: (p: CourseDownloadProgress) => void
): Promise<void> {
  if (!isTauriRuntime()) requireTauri("course download");
  const core = await import("@tauri-apps/api/core");
  const channel = new core.Channel<CourseDownloadProgress>();
  channel.onmessage = onProgress;
  return tauriInvoke("download_course", { courseId, channel });
}

// ── License status ────────────────────────────────────────────────────────────

export interface LicenseStatus {
  install_date:       string;   // RFC 3339
  last_poll:          string;   // RFC 3339
  days_since_install: number;
  days_since_poll:    number;
  /** Days until earliest expiry condition; negative = already expired */
  days_until_expiry:  number;
  expiry_reason:      string | null;
  is_expired:         boolean;
  warning_message:    string | null;
  max_install_days:   number;
  inactivity_days:    number;
}

export async function getLicenseStatus(): Promise<LicenseStatus> {
  if (isTauriRuntime()) {
    return tauriInvoke("get_license_status");
  }
  return {
    install_date: new Date().toISOString(),
    last_poll: new Date().toISOString(),
    days_since_install: 0,
    days_since_poll: 0,
    days_until_expiry: 365,
    expiry_reason: null,
    is_expired: false,
    warning_message: null,
    max_install_days: 365,
    inactivity_days: 365,
  };
}

