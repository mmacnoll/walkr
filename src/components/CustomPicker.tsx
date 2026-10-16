"use client";

import type { CustomEstimate } from "@/lib/customWalk";
import type { LatLng } from "@/lib/types";
import { formatMiles } from "@/lib/walk";
import type { ExtraStop } from "@/lib/types";
import ExtraStopsPicker from "./ExtraStopsPicker";
import RefreshmentPicker, { type RefreshmentChoice } from "./RefreshmentPicker";

export type Pick = { placeId: string; location: LatLng; name?: string };
export type FoodChoice = RefreshmentChoice;

type Props = {
  /** Picks in walking order (best loop). */
  picks: Pick[];
  estimate: CustomEstimate;
  max: number;
  food: FoodChoice;
  /** False when there are already too many sights to also fit a food stop. */
  foodAllowed: boolean;
  extras: ExtraStop[];
  onToggleExtra: (kind: ExtraStop) => void;
  availableExtras: Set<ExtraStop>;
  /** False when another stop wouldn't fit Google's 10-stop limit. */
  roomForMoreExtras: boolean;
  onFoodChange: (food: FoodChoice) => void;
  onRemove: (placeId: string) => void;
  onClear: () => void;
};

const fieldLabel = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-muted";

export default function CustomPicker(props: Props) {
  const { picks, estimate, max, food, foodAllowed, onFoodChange, onRemove, onClear } = props;
  const minutes = Math.round(estimate.minutes);
  return (
    <div className="flex flex-col gap-5">
      {/* Live tracker */}
      <div aria-live="polite" className="rounded-xl border border-line bg-sage px-4 py-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-forest">Your walk so far</span>
          <span className="text-xs text-forest">
            {picks.length}/{max} sights
          </span>
        </div>
        {picks.length ? (
          <p className="mt-1 text-2xl font-semibold tabular-nums text-forest">
            ≈ {minutes} min <span className="text-base font-normal text-forest">· {formatMiles(estimate.meters)}</span>
          </p>
        ) : (
          <p className="mt-1 text-sm text-forest">Tap a purple or teal dot on the map, then “Add to walk”.</p>
        )}
        {picks.length > 0 && (
          <p className="mt-0.5 text-[11px] text-forest">
            Estimate{food !== "none" ? ", including a short refreshment detour" : ""}{props.extras.some((x) => props.availableExtras.has(x)) ? " and your added stops" : ""}. You&apos;ll get Google&apos;s exact time when you build it.
          </p>
        )}
      </div>

      {/* Picked sights, in walking order */}
      {picks.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className={`${fieldLabel} mb-0`}>Your sights (best order)</span>
            <button
              type="button"
              onClick={onClear}
              className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-ink transition hover:bg-paper-2"
            >
              ✕ Clear all
            </button>
          </div>
          <ol className="flex flex-col">
            {picks.map((p, i) => (
              <li key={p.placeId} className="flex items-center gap-3 py-1.5">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pine text-xs font-bold text-white">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{p.name ?? "Sight"}</span>
                <button
                  type="button"
                  onClick={() => onRemove(p.placeId)}
                  aria-label={`Remove ${p.name ?? "sight"}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-lg text-muted hover:bg-paper-2 hover:text-ink"
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          {picks.length >= max && <p className="mt-1 text-xs text-ochre">That&apos;s the most sights one walk can have.</p>}
        </div>
      )}

      <RefreshmentPicker value={food} onChange={onFoodChange} allowed={foodAllowed} />
      <ExtraStopsPicker value={props.extras} onToggle={props.onToggleExtra} available={props.availableExtras} roomForMore={props.roomForMoreExtras} />
    </div>
  );
}
