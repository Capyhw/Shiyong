import { useSyncExternalStore } from "react";
import { parseCatalog, type CachedCatalog } from "./catalog";
import { defaults, parsePreferences, type Preferences } from "./preferences";
export { removeApp, type Preferences } from "./preferences";

const KEY = "shiyong.preferences.v1";

function read(): Preferences {
  try {
    const saved = localStorage.getItem(KEY);
    return saved ? parsePreferences(JSON.parse(saved)) : defaults;
  } catch {
    return defaults;
  }
}
let current = read();
const listeners = new Set<() => void>();
function notify() {
  listeners.forEach((listener) => listener());
}
window.addEventListener("storage", (event) => {
  if (event.key === KEY) {
    current = read();
    notify();
  }
});
export function usePreferences() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    () => current,
  );
}
export function updatePreferences(change: (old: Preferences) => Preferences) {
  const next = parsePreferences(change(read()));
  localStorage.setItem(KEY, JSON.stringify(next));
  current = next;
  notify();
}

export function getCache(endpoint: string): CachedCatalog | null {
  try {
    const raw = JSON.parse(
      localStorage.getItem(`shiyong.catalog.v1:${endpoint}`) || "null",
    );
    if (!raw || typeof raw.savedAt !== "string") return null;
    return {
      catalog: parseCatalog(raw.catalog),
      etag: typeof raw.etag === "string" ? raw.etag : null,
      savedAt: raw.savedAt,
    };
  } catch {
    return null;
  }
}
export function saveCache(endpoint: string, cache: CachedCatalog) {
  localStorage.setItem(`shiyong.catalog.v1:${endpoint}`, JSON.stringify(cache));
}
