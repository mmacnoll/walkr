"use client";

import type { ExtraStop } from "@/lib/types";
import { EXTRA_STOPS } from "@/lib/walk";

type Props = {
  value: ExtraStop[];
  /** Turn one kind on or off. */
  onToggle: (kind: ExtraStop) => void;
  /** Kinds that exist in or right next to this park. */
  available: Set<ExtraStop>;
  /** False when the walk has no room for another stop (Customize mode with many sights). */
  roomForMore?: boolean;
};

const fieldLabel = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500";

/** Optional practical stops: any combination of restroom, water, playground, dog run. */
export default function ExtraStopsPicker({ value, onToggle, available, roomForMore = true }: Props) {
  const missingHere = EXTRA_STOPS.filter((x) => !available.has(x.id));
  return (
    <fieldset>
      <legend className={fieldLabel}>Add stops</legend>
      <div className="grid grid-cols-2 gap-2">
        {EXTRA_STOPS.map((x) => {
          const on = value.includes(x.id);
          const disabled = !on && (!available.has(x.id) || !roomForMore);
          return (
            <button
              key={x.id}
              type="button"
              aria-pressed={on}
              disabled={disabled}
              onClick={() => onToggle(x.id)}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-medium transition disabled:opacity-40 ${
                on ? "border-sky-600 bg-sky-50 text-sky-900 ring-2 ring-sky-600/20" : "border-zinc-200 bg-white text-zinc-700"
              }`}
            >
              <span aria-hidden className="text-lg">
                {x.emoji}
              </span>
              {x.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-zinc-500">
        {!roomForMore && value.length < EXTRA_STOPS.length
          ? "Remove a sight to make room for more stops."
          : value.length
            ? "We'll add the nearest ones that fit your route."
            : "Optional. Pick any you'd like along the way."}
        {missingHere.length > 0 && ` No ${missingHere.map((x) => x.noun).join(" or ")} at this park.`}
      </p>
    </fieldset>
  );
}
