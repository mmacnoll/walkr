"use client";

import { parks } from "@/data/parks";
import type { Mood, Park } from "@/lib/types";
import {
  describeLength,
  LENGTH_LIMITS,
  type LengthUnit,
  milesToMinutes,
  minutesToMiles,
  MOODS,
  snapToSlider,
} from "@/lib/walk";

type Props = {
  park: Park;
  entranceId: string;
  minutes: number;
  unit: LengthUnit;
  mood: Mood;
  onParkChange: (parkId: string) => void;
  onEntranceChange: (entranceId: string) => void;
  onMinutesChange: (minutes: number) => void;
  onUnitChange: (unit: LengthUnit) => void;
  onMoodChange: (mood: Mood) => void;
  onSubmit: () => void;
};

const fieldLabel = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-zinc-500";

export default function WalkForm(props: Props) {
  const { park, entranceId, minutes, unit, mood } = props;
  const popular = park.entrances.filter((e) => e.popular);
  const others = park.entrances.filter((e) => !e.popular);
  const sliderValue = unit === "min" ? minutes : snapToSlider(minutesToMiles(minutes), "mi");
  const limits = LENGTH_LIMITS[unit];

  function changeUnit(next: LengthUnit) {
    if (next === unit) return;
    // Keep roughly the same walk, snapped to the new slider's steps.
    const snapped = next === "mi" ? milesToMinutes(snapToSlider(minutesToMiles(minutes), "mi")) : snapToSlider(minutes, "min");
    props.onMinutesChange(snapped);
    props.onUnitChange(next);
  }

  return (
    <form
      className="flex flex-col gap-5"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSubmit();
      }}
    >
      {/* Park */}
      <div>
        <label htmlFor="park" className={fieldLabel}>
          Park
        </label>
        <select
          id="park"
          value={park.id}
          onChange={(e) => props.onParkChange(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 focus:border-green-700 focus:outline-none focus:ring-2 focus:ring-green-700/20"
        >
          {(["Manhattan", "Brooklyn"] as const).map((borough) => (
            <optgroup key={borough} label={borough}>
              {parks
                .filter((p) => p.borough === borough)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Start */}
      <div>
        <label htmlFor="entrance" className={fieldLabel}>
          Start at
        </label>
        <select
          id="entrance"
          value={entranceId}
          onChange={(e) => props.onEntranceChange(e.target.value)}
          className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2.5 text-base text-zinc-900 focus:border-green-700 focus:outline-none focus:ring-2 focus:ring-green-700/20"
        >
          <optgroup label="Popular">
            {popular.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </optgroup>
          {others.length > 0 && (
            <optgroup label={`All entrances (${others.length})`}>
              {others.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <p className="mt-1 text-xs text-zinc-500">…or tap a green dot on the map.</p>
      </div>

      {/* Length */}
      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <label htmlFor="length" className={`${fieldLabel} mb-0`}>
            Walk length
          </label>
          <div role="group" aria-label="Length unit" className="flex rounded-full bg-zinc-100 p-0.5 text-xs font-medium">
            {(["min", "mi"] as const).map((u) => (
              <button
                key={u}
                type="button"
                aria-pressed={unit === u}
                onClick={() => changeUnit(u)}
                className={`rounded-full px-3 py-1 transition ${unit === u ? "bg-white text-zinc-900 shadow" : "text-zinc-500"}`}
              >
                {u === "min" ? "Minutes" : "Miles"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-semibold tabular-nums text-zinc-900">
            {unit === "min" ? Math.round(minutes) : sliderValue}
          </span>
          <span className="text-sm text-zinc-500">{unit === "min" ? "minutes" : "miles"}</span>
          <span className="ml-auto text-xs text-zinc-400">{describeLength(minutes)}</span>
        </div>
        <input
          id="length"
          type="range"
          min={limits.min}
          max={limits.max}
          step={limits.step}
          value={sliderValue}
          onChange={(e) => {
            const v = Number(e.target.value);
            props.onMinutesChange(unit === "min" ? v : milesToMinutes(v));
          }}
          className="mt-2 h-8 w-full cursor-pointer accent-green-700"
        />
        <div className="flex justify-between text-[11px] text-zinc-400">
          <span>{limits.min} {unit}</span>
          <span>{limits.max} {unit}</span>
        </div>
      </div>

      {/* Mood */}
      <fieldset>
        <legend className={fieldLabel}>Mood</legend>
        <div className="grid grid-cols-2 gap-2">
          {MOODS.map((m) => {
            const selected = m.id === mood;
            return (
              <label
                key={m.id}
                className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-3 text-sm font-medium transition ${
                  selected ? "border-green-700 bg-green-50 text-green-900 ring-2 ring-green-700/20" : "border-zinc-200 bg-white text-zinc-700"
                }`}
              >
                <input
                  type="radio"
                  name="mood"
                  value={m.id}
                  checked={selected}
                  onChange={() => props.onMoodChange(m.id)}
                  className="sr-only"
                />
                <span aria-hidden className="text-lg">
                  {m.emoji}
                </span>
                {m.label}
              </label>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-zinc-500">{MOODS.find((m) => m.id === mood)?.description}</p>
      </fieldset>

      <button
        type="submit"
        className="rounded-xl bg-green-700 px-4 py-3.5 text-base font-semibold text-white shadow-sm transition hover:bg-green-800 active:scale-[0.99]"
      >
        Generate walk
      </button>
    </form>
  );
}
