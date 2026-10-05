"use client";

import { formatDuration, formatMiles, googleMapsDirectionsUrl, type WalkResult, type WalkStop } from "@/lib/walk";

type Props = {
  walk: WalkResult;
  selectedStopId: string | null;
  loading: boolean;
  onSelectStop: (id: string) => void;
  onTryAnother: () => void;
  onEdit: () => void;
};

export function stopBadge(stop: WalkStop, index: number): string {
  if (stop.kind === "coffee") return "☕";
  if (stop.kind === "lunch") return "🥪";
  return String(index + 1);
}

export default function ResultsPanel({ walk, selectedStopId, loading, onSelectStop, onTryAnother, onEdit }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Distance" value={formatMiles(walk.distanceMeters)} />
        <Stat label="Walking time" value={formatDuration(walk.durationSeconds)} />
        <Stat label="Stops" value={String(walk.stops.length)} />
      </div>
      <p className="-mt-2 text-center text-xs text-zinc-500">
        You asked for {formatMiles(walk.targetMeters)}
        {walk.withinTarget ? " ✓" : ""}. Time is Google&apos;s estimate at an easy pace.
      </p>

      {walk.note && <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">{walk.note}</p>}

      {/* Stop list: start → stops → back to start */}
      <ol className="relative flex flex-col">
        <StopRow badge="▶" badgeClass="bg-green-700" title={walk.start.name} subtitle="Start" />
        {walk.stops.map((stop, i) => (
          <li key={stop.id}>
            <button
              type="button"
              onClick={() => onSelectStop(stop.id)}
              className={`flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-zinc-50 ${
                selectedStopId === stop.id ? "bg-blue-50" : ""
              }`}
            >
              <Badge text={stopBadge(stop, i)} className={stop.kind === "coffee" || stop.kind === "lunch" ? "bg-amber-500" : "bg-blue-600"} />
              <span className="min-w-0">
                <span className="block font-medium leading-5 text-zinc-900">{stop.name}</span>
                {stop.detail && <span className="block text-xs text-zinc-500">{stop.detail}</span>}
              </span>
            </button>
          </li>
        ))}
        <StopRow badge="■" badgeClass="bg-green-700" title={walk.start.name} subtitle="Back to start" />
      </ol>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onTryAnother}
          disabled={loading}
          className="rounded-xl bg-green-700 px-3 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-green-800 disabled:cursor-wait disabled:opacity-70"
        >
          {loading ? "Finding another…" : "↻ Try another"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          className="rounded-xl border border-zinc-300 bg-white px-3 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50"
        >
          ✎ Edit walk
        </button>
      </div>
      <a
        href={googleMapsDirectionsUrl(walk.start.location, walk.stops)}
        target="_blank"
        rel="noreferrer"
        className="text-center text-sm font-medium text-blue-700 underline-offset-2 hover:underline"
      >
        Open in Google Maps for turn-by-turn directions ↗
      </a>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-zinc-50 px-2 py-2.5">
      <div className="text-lg font-semibold tabular-nums text-zinc-900">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-zinc-500">{label}</div>
    </div>
  );
}

function Badge({ text, className }: { text: string; className: string }) {
  return (
    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${className}`}>{text}</span>
  );
}

function StopRow({ badge, badgeClass, title, subtitle }: { badge: string; badgeClass: string; title: string; subtitle: string }) {
  return (
    <li className="flex items-start gap-3 px-2 py-2">
      <Badge text={badge} className={badgeClass} />
      <span className="min-w-0">
        <span className="block font-medium leading-5 text-zinc-900">{title}</span>
        <span className="block text-xs text-zinc-500">{subtitle}</span>
      </span>
    </li>
  );
}
