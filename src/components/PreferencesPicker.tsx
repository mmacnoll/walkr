"use client";

import type { Preference } from "@/lib/walk";

type Props = {
  value: Preference[];
  onToggle: (pref: Preference) => void;
  hasWaterfront: boolean;
  /** Share of this park's paths with lighting mapped (0–1). */
  lightingCoverage: number;
  /** Customize mode: preferences can't change your picks, only be measured. */
  measureOnly?: boolean;
};

const fieldLabel = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500";
const OPTIONS: { id: Preference; label: string; emoji: string }[] = [
  { id: "lit", label: "Well lit", emoji: "💡" },
  { id: "water", label: "Waterfront", emoji: "🌊" },
];

/** Optional route preferences: prefer lit paths and/or the water's edge. */
export default function PreferencesPicker({ value, onToggle, hasWaterfront, lightingCoverage, measureOnly }: Props) {
  const hints: string[] = [];
  if (!value.length) hints.push("Optional.");
  else hints.push(measureOnly ? "We'll show how much of your walk is lit / along the water." : "We'll lean the walk that way and show how it did.");
  if (value.includes("lit") && lightingCoverage < 0.15) hints.push("Lighting is only partly mapped around this park.");
  if (!hasWaterfront) hints.push("This park isn't next to the water.");
  return (
    <fieldset>
      <legend className={fieldLabel}>Prefer</legend>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((o) => {
          const disabled = o.id === "water" && !hasWaterfront;
          const on = value.includes(o.id) && !disabled;
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onToggle(o.id)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition disabled:opacity-40 ${
                on ? "border-indigo-600 bg-indigo-50 text-indigo-900 ring-2 ring-indigo-600/20" : "border-zinc-200 bg-white text-zinc-700"
              }`}
            >
              <span aria-hidden className="text-lg">
                {o.emoji}
              </span>
              {o.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-zinc-500">{hints.join(" ")}</p>
    </fieldset>
  );
}
