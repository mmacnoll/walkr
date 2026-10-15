// Saved walks, kept on this device (browser storage). Each entry is the walk's share token plus a
// summary we write ourselves; Google place names aren't stored (opening rebuilds them live).
import type { WalkResult } from "./walk";
import { formatDuration, formatMiles, stopEmoji } from "./walk";

export type SavedWalk = {
  token: string;
  parkId: string;
  parkName: string;
  /** "1.9 mi · 42 min · 7 stops" */
  summary: string;
  /** Icons for refreshment / extra stops, e.g. "🍰🚻". */
  icons: string;
  savedAt: string; // ISO date
};

const KEY = "walkr:saved-walks";
export const MAX_SAVED = 30;

/** The bits of localStorage we use (so tests can pass a fake). */
export type Storage = Pick<globalThis.Storage, "getItem" | "setItem">;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // private mode / blocked storage
  }
}

export function listSaved(store: Storage | null = storage()): SavedWalk[] {
  try {
    const list = JSON.parse(store?.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((w) => w && typeof w.token === "string") : [];
  } catch {
    return [];
  }
}

function write(list: SavedWalk[], store: Storage | null): boolean {
  try {
    if (!store) return false;
    store.setItem(KEY, JSON.stringify(list));
    if (typeof window !== "undefined") window.dispatchEvent(new Event(CHANGED));
    return true;
  } catch {
    return false; // storage full or blocked
  }
}

export function isSaved(token: string | undefined, store: Storage | null = storage()): boolean {
  return !!token && listSaved(store).some((w) => w.token === token);
}

/** Saves a walk (newest first, at most MAX_SAVED). Returns false if it couldn't be stored. */
export function saveWalk(walk: WalkResult, parkName: string, store: Storage | null = storage(), now = new Date()): boolean {
  if (!walk.share) return false;
  const entry: SavedWalk = {
    token: walk.share,
    parkId: walk.parkId,
    parkName,
    summary: `${formatMiles(walk.distanceMeters)} · ${formatDuration(walk.durationSeconds)} · ${walk.stops.length} stop${walk.stops.length === 1 ? "" : "s"}`,
    icons: walk.stops.map((s) => stopEmoji(s.kind) ?? "").join(""),
    savedAt: now.toISOString(),
  };
  const others = listSaved(store).filter((w) => w.token !== entry.token);
  return write([entry, ...others].slice(0, MAX_SAVED), store);
}

export function removeSaved(token: string, store: Storage | null = storage()): void {
  write(
    listSaved(store).filter((w) => w.token !== token),
    store,
  );
}

// --- live list for React (useSyncExternalStore): updates on save/delete and in other tabs ---
const CHANGED = "walkr:saved-walks-changed";
let cache: { raw: string | null; list: SavedWalk[] } = { raw: null, list: [] };
const EMPTY: SavedWalk[] = [];

export function subscribeSaved(onChange: () => void): () => void {
  window.addEventListener("storage", onChange); // other tabs
  window.addEventListener(CHANGED, onChange); // this tab
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGED, onChange);
  };
}

/** Same array object until the stored list actually changes (React needs a stable snapshot). */
export function savedSnapshot(): SavedWalk[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(KEY);
  } catch {
    return EMPTY;
  }
  if (raw !== cache.raw) cache = { raw, list: listSaved() };
  return cache.list;
}

/** On the server (and the first browser render) nothing is saved yet. */
export const savedServerSnapshot = () => EMPTY;
