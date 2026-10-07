"use client";

import type { CustomEstimate } from "@/lib/customWalk";
import type { LatLng } from "@/lib/types";
import { formatMiles } from "@/lib/walk";

export type Pick = { placeId: string; location: LatLng; name?: string };
export type FoodChoice = "none" | "coffee" | "lunch";

type Props = {
  /** Picks in walking order (best loop). */
  picks: Pick[];
  estimate: CustomEstimate;
  max: number;
  food: FoodChoice;
  /** False when there are already too many sights to also fit a food stop. */
  foodAllowed: boolean;
  onFoodChange: (food: FoodChoice) => void;
  onRemove: (placeId: string) => void;
  onClear: () => void;
};

const fieldLabel = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500";

export default function CustomPicker({ picks, estimate, max, food, foodAllowed, onFoodChange, onRemove, onClear }: Props) {
  const minutes = Math.round(estimate.minutes);
  return (
    <div className="flex flex-col gap-5">
      {/* Live tracker */}
      <div aria-live="polite" className="rounded-xl border border-green-200 bg-green-50 px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-green-900">Your walk so far</span>
          <span className="text-xs text-green-900">
            {picks.length}/{max} sights
          </span>
        </div>
        {picks.length ? (
          <p className="mt-1 text-2xl font-semibold tabular-nums text-green-950">
            ≈ {minutes} min <span className="text-base font-normal text-green-900">· {formatMiles(estimate.meters)}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-green-900">Tap a purple or teal dot on the map, then “Add to walk”.</p>
        )}
        {picks.length > 0 && (
          <p className="mt-0.5 text-[11px] text-green-800">
            Estimate{food !== "none" ? ", including a short food detour" : ""}. You&apos;ll get Google&apos;s exact time when you build it.
          </p>
        )}
      </div>

      {/* Picked sights, in walking order */}
      {picks.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className={`${fieldLabel} mb-0`}>Your sights (best order)</span>
            <button type="button" onClick={onClear} className="text-xs font-medium text-zinc-500 underline-offset-2 hover:underline">
              Clear all
            </button>
          </div>
          <ol className="flex flex-col">
            {picks.map((p, i) => (
              <li key={p.placeId} className="flex items-center gap-3 py-1.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-900">{p.name ?? "Sight"}</span>
                <button
                  type="button"
                  onClick={() => onRemove(p.placeId)}
                  aria-label={`Remove ${p.name ?? "sight"}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          {picks.length >= max && <p className="mt-1 text-xs text-amber-800">That&apos;s the most sights one walk can have.</p>}
        </div>
      )}

      {/* Optional food stop */}
      <fieldset>
        <legend className={fieldLabel}>Food stop</legend>
        <div role="group" className="grid grid-cols-3 gap-2">
          {(
            [
              ["none", "None", ""],
              ["coffee", "Coffee", "☕"],
              ["lunch", "Lunch", "🥪"],
            ] as const
          ).map(([id, label, emoji]) => (
            <button
              key={id}
              type="button"
              aria-pressed={food === id}
              disabled={id !== "none" && !foodAllowed}
              onClick={() => onFoodChange(id)}
              className={`rounded-xl border px-2 py-2.5 text-sm font-medium transition disabled:opacity-40 ${
                food === id ? "border-green-700 bg-green-50 text-green-900 ring-2 ring-green-700/20" : "border-zinc-200 bg-white text-zinc-700"
              }`}
            >
              {emoji && <span aria-hidden>{emoji} </span>}
              {label}
            </button>
          ))}
        </div>
        {!foodAllowed && <p className="mt-1.5 text-xs text-zinc-500">Remove a sight to make room for a food stop.</p>}
        {food !== "none" && <p className="mt-1.5 text-xs text-zinc-500">We&apos;ll add a well-rated {food === "coffee" ? "café" : "lunch spot"} near your route.</p>}
      </fieldset>
    </div>
  );
}
