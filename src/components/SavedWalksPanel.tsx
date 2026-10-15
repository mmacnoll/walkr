"use client";

import type { SavedWalk } from "@/lib/savedWalks";

type Props = {
  saved: SavedWalk[];
  loading: boolean;
  onOpen: (token: string) => void;
  onDelete: (token: string) => void;
  onBack: () => void;
};

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Walks saved on this device, newest first. Opening one rebuilds it from its share link. */
export default function SavedWalksPanel({ saved, loading, onOpen, onDelete, onBack }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <button type="button" onClick={onBack} className="self-start text-sm font-medium text-green-800 hover:underline">
        ← Back
      </button>
      {saved.length === 0 ? (
        <p className="rounded-lg bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-600">No saved walks yet. Tap ⭐ Save on a walk to keep it here.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {saved.map((w) => (
            <li key={w.token} className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2.5">
              <button type="button" disabled={loading} onClick={() => onOpen(w.token)} className="min-w-0 flex-1 text-left disabled:opacity-60">
                <span className="block truncate font-medium text-zinc-900">{w.parkName}</span>
                <span className="block truncate text-xs text-zinc-500">
                  {w.summary}
                  {w.icons && ` · ${w.icons}`} · {dateLabel(w.savedAt)}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onDelete(w.token)}
                aria-label={`Delete saved walk in ${w.parkName}`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                🗑
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-zinc-500">Saved on this device only. Opening a walk rebuilds it with fresh details.</p>
    </div>
  );
}
