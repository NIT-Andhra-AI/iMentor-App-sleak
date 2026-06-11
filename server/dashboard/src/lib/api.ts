import { authStore } from "../stores/authStore";
import { get } from "svelte/store";

function apiKey(): string {
  return get(authStore).key;
}

function baseUrl(): string {
  // In dev (vite proxy / direct), the API is on the same origin minus /dashboard.
  return window.location.origin;
}

async function req<T>(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<T> {
  const res = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Key": apiKey(),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

export function getStats() {
  return req<StatsResponse>("GET", "/admin/api/stats");
}

export function getSessions(page: number, mode?: string) {
  const qs = new URLSearchParams({ page: String(page), per_page: "50" });
  if (mode) qs.set("mode", mode);
  return req<SessionListResponse>("GET", `/admin/api/sessions?${qs}`);
}

export function getSessionDetail(id: number) {
  return req<unknown>("GET", `/admin/api/sessions/${id}`);
}

export function getCourses() {
  return req<CourseEntry[]>("GET", "/v1/courses");
}

export function deleteCourse(id: string) {
  return req<unknown>("DELETE", `/v1/courses/${id}`, undefined, { "X-Admin-Key": apiKey() });
}

/** Upload a course ZIP with XHR so we get progress events. */
export function uploadCourse(
  data: {
    course_id: string;
    title: string;
    description: string;
    version: string;
    bundle: File;
  },
  onProgress: (pct: number) => void
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("course_id", data.course_id);
    form.append("title", data.title);
    form.append("description", data.description);
    form.append("version", data.version);
    form.append("bundle", data.bundle);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${baseUrl()}/v1/courses`);
    xhr.setRequestHeader("X-Admin-Key", apiKey());

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(JSON.parse(xhr.responseText));
      } else {
        reject(new Error(`${xhr.status}: ${xhr.responseText}`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Network error")));
    xhr.send(form);
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface StatsResponse {
  total_sessions: number;
  sessions_today: number;
  active_courses: number;
  avg_ttft_ms: number;
  sessions_per_day: { day: string; count: number }[];
  mode_distribution: { mode: string; count: number }[];
  pii_redaction_counts: Record<string, number>;
}

export interface SessionRow {
  id: number;
  session_id: string;
  app_version: string;
  timestamp_utc: string;
  mode: string;
  message_count: number;
  received_at: string;
}

export interface SessionListResponse {
  total: number;
  page: number;
  per_page: number;
  sessions: SessionRow[];
}

export interface CourseEntry {
  id: string;
  title: string;
  description: string;
  version: string;
  wiki_page_count: number;
  size_bytes: number;
}
