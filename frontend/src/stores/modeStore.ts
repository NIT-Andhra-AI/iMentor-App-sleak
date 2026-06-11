import { create } from "zustand";
import type { ChatMode } from "../lib/tauri";

interface ModeStore {
  mode: ChatMode;
  setMode: (mode: ChatMode) => void;
}

export const useModeStore = create<ModeStore>((set) => ({
  mode: { type: "general" },
  setMode: (mode) => set({ mode }),
}));
