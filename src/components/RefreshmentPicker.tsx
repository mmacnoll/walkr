"use client";

import type { Refreshment } from "@/lib/types";
import { REFRESHMENTS, refreshmentNoun } from "@/lib/walk";

export type RefreshmentChoice = "none" | Refreshment;

type Props = {
  value: RefreshmentChoice;
  onChange: (value: RefreshmentChoice) => void;
  /** False when the walk has no room for one more stop (Customize mode with 10 sights). */
  allowed?: boolean;
};

const fieldLabel = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500";
const OPTIONS: { id: RefreshmentChoice; label: string; emoji: string }[] = [{ id: "none", label: "None", emoji: "" }, ...REFRESHMENTS];

/** One optional refreshment stop per walk: None / Coffee / Lunch / Sweet treat. Used in both modes. */
export default function RefreshmentPicker({ value, onChange, allowed = true }: Props) {
  return (
    <fieldset>
      <legend className={fieldLabel}>Refreshment</legend>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((o) => {
          const selected = o.id === value;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={selected}
              disabled={o.id !== "none" && !allowed}
              onClick={() => onChange(o.id)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition disabled:opacity-40 ${
                selected ? "border-green-700 bg-green-50 text-green-900 ring-2 ring-green-700/20" : "border-zinc-200 bg-white text-zinc-700"
              }`}
            >
              {o.emoji && (
                <span aria-hidden className="text-lg">
                  {o.emoji}
                </span>
              )}
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-zinc-500">
        {!allowed
          ? "Remove a sight to make room for a refreshment stop."
          : value === "none"
            ? "Add one stop for a drink or a bite along the way."
            : `We'll add a well-rated ${refreshmentNoun(value)} that's open, near your route.`}
      </p>
    </fieldset>
  );
}
