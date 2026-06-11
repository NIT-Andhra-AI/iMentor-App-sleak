/**
 * Svelte stores — replaces Zustand.
 * Built into Svelte: writable() is reactive and auto-unsubscribes in components.
 */
import { writable } from "svelte/store";
import type { CourseInfo, ModelStatus, ChatMode } from "./tauri";

// Re-export types needed by components
export type { ChatMode };

// ── Message type ──────────────────────────────────────────────────────────────
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  timestamp: number;
}

// ── Mode store ────────────────────────────────────────────────────────────────
export type AppMode =
  | { type: "general" }
  | { type: "course"; courseId: string; courseName: string }
  | { type: "documents" };

export const mode = writable<AppMode>({ type: "general" });

// ── Session store ─────────────────────────────────────────────────────────────
export interface Session {
  id: string;
  title: string;
  mode: string;
  updatedAt: number;
}

function createSessionStore() {
  const { subscribe, update } = writable<{
    sessions: Session[];
    currentId: string | null;
  }>({ sessions: [], currentId: null });

  return {
    subscribe,
    setAll(sessions: Session[], currentId: string | null) {
      update(() => ({ sessions, currentId }));
    },
    add(s: Session) {
      update((st) => ({ ...st, sessions: [s, ...st.sessions] }));
    },
    setCurrent(id: string) {
      update((st) => ({ ...st, currentId: id }));
    },
    rename(id: string, title: string) {
      update((st) => ({
        ...st,
        sessions: st.sessions.map((s) =>
          s.id === id ? { ...s, title, updatedAt: Date.now() } : s
        ),
      }));
    },
    delete(id: string) {
      update((st) => ({
        ...st,
        sessions: st.sessions.filter((s) => s.id !== id),
        currentId: st.currentId === id
          ? (st.sessions.find((s) => s.id !== id)?.id ?? null)
          : st.currentId,
      }));
    },
  };
}

export const sessionStore = createSessionStore();

// ── Course store ──────────────────────────────────────────────────────────────
export const courses = writable<CourseInfo[]>([]);

// ── Model status ──────────────────────────────────────────────────────────────
export const modelStatus = writable<ModelStatus | null>(null);

// ── Study context (wiki page open in courses tab) ─────────────────────────────
export interface StudyContext {
  courseId: string;
  pageSlug: string;
  pageTitle: string;
  pageContent: string;
}
export const studyContext = writable<StudyContext | null>(null);

// ── RAG session (documents tab chat — not shown in sessions list) ─────────────
function makeRagSessionId(): string {
  return `rag-session-${Date.now()}`;
}
export const ragSessionId = writable<string>(makeRagSessionId());

// ── UI state ──────────────────────────────────────────────────────────────────
export type Sidebar = "sessions" | "courses" | "documents" | "agents" | "settings";
export type RightPanel = "chat" | "wiki" | "agents";

export const activeSidebar = writable<Sidebar>("sessions");
export const rightPanel    = writable<RightPanel>("chat");
export const showDownloader = writable(false);
export const showPrereq     = writable(false);
export const consentPending = writable<boolean | null>(null);
