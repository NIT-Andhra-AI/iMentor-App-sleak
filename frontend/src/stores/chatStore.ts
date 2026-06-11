import { create } from "zustand";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
  timestamp: number;
}

export interface Session {
  id: string;
  title: string;
  mode: string;
  updatedAt: number;
}

interface ChatStore {
  sessions: Session[];
  currentSessionId: string | null;
  messages: Record<string, Message[]>;  // session_id -> messages
  isGenerating: boolean;

  setCurrentSession: (id: string) => void;
  addSession: (session: Session) => void;
  addMessage: (sessionId: string, message: Message) => void;
  appendToken: (sessionId: string, messageId: string, token: string) => void;
  setGenerating: (generating: boolean) => void;
  finalizeMessage: (sessionId: string, messageId: string) => void;
  getCurrentMessages: () => Message[];
}

export const useChatStore = create<ChatStore>((set, get) => ({
  sessions: [],
  currentSessionId: null,
  messages: {},
  isGenerating: false,

  setCurrentSession: (id) => set({ currentSessionId: id }),

  addSession: (session) =>
    set((state) => ({ sessions: [session, ...state.sessions] })),

  addMessage: (sessionId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: [...(state.messages[sessionId] ?? []), message],
      },
    })),

  appendToken: (sessionId, messageId, token) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: (state.messages[sessionId] ?? []).map((m) =>
          m.id === messageId ? { ...m, content: m.content + token } : m
        ),
      },
    })),

  setGenerating: (isGenerating) => set({ isGenerating }),

  finalizeMessage: (sessionId, messageId) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [sessionId]: (state.messages[sessionId] ?? []).map((m) =>
          m.id === messageId ? { ...m, streaming: false } : m
        ),
      },
    })),

  getCurrentMessages: () => {
    const { currentSessionId, messages } = get();
    if (!currentSessionId) return [];
    return messages[currentSessionId] ?? [];
  },
}));
