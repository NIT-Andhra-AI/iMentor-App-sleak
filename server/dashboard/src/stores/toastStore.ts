import { writable } from "svelte/store";

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "error" | "success";
}

let _id = 0;
const { subscribe, update } = writable<Toast[]>([]);

export const toastStore = {
  subscribe,
  show(message: string, kind: Toast["kind"] = "info", durationMs = 3500) {
    const id = ++_id;
    update((ts) => [...ts, { id, message, kind }]);
    setTimeout(() => update((ts) => ts.filter((t) => t.id !== id)), durationMs);
  },
  error(msg: string) { this.show(msg, "error", 5000); },
  success(msg: string) { this.show(msg, "success"); },
};
