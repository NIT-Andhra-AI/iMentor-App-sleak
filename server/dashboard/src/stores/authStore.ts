import { writable } from "svelte/store";

const STORAGE_KEY = "admin_api_key";

function createAuth() {
  const stored = localStorage.getItem(STORAGE_KEY) ?? "";
  const { subscribe, set, update } = writable<{ key: string; authed: boolean }>({
    key: stored,
    authed: false,
  });

  return {
    subscribe,
    login(key: string) {
      localStorage.setItem(STORAGE_KEY, key);
      set({ key, authed: true });
    },
    logout() {
      localStorage.removeItem(STORAGE_KEY);
      set({ key: "", authed: false });
    },
    /** Call once on mount to mark as authed if a stored key exists. */
    restoreIfStored() {
      if (stored) update((s) => ({ ...s, authed: true }));
    },
  };
}

export const authStore = createAuth();
