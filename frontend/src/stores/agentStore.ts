import { create } from "zustand";
import type { AgentInfo } from "../lib/tauri";

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  streaming?: boolean;
}

interface AgentStore {
  agents: AgentInfo[];
  agentMessages: Record<string, AgentMessage[]>;
  activeAgentId: string | null;

  setAgents: (agents: AgentInfo[]) => void;
  setActiveAgent: (id: string | null) => void;
  addAgentMessage: (agentId: string, msg: AgentMessage) => void;
  appendAgentToken: (agentId: string, msgId: string, token: string) => void;
  finalizeAgentMessage: (agentId: string, msgId: string) => void;
}

export const useAgentStore = create<AgentStore>((set) => ({
  agents: [],
  agentMessages: {},
  activeAgentId: null,

  setAgents: (agents) => set({ agents }),
  setActiveAgent: (id) => set({ activeAgentId: id }),

  addAgentMessage: (agentId, msg) =>
    set((state) => ({
      agentMessages: {
        ...state.agentMessages,
        [agentId]: [...(state.agentMessages[agentId] ?? []), msg],
      },
    })),

  appendAgentToken: (agentId, msgId, token) =>
    set((state) => ({
      agentMessages: {
        ...state.agentMessages,
        [agentId]: (state.agentMessages[agentId] ?? []).map((m) =>
          m.id === msgId ? { ...m, content: m.content + token } : m
        ),
      },
    })),

  finalizeAgentMessage: (agentId, msgId) =>
    set((state) => ({
      agentMessages: {
        ...state.agentMessages,
        [agentId]: (state.agentMessages[agentId] ?? []).map((m) =>
          m.id === msgId ? { ...m, streaming: false } : m
        ),
      },
    })),
}));
