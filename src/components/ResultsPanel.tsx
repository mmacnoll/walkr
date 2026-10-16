"use client";

import { formatDuration, formatMiles, googleMapsDirectionsUrl, stopColor, stopEmoji, type WalkResult, type WalkStop } from "@/lib/walk";

type Props = {
  walk: WalkResult;
  selectedStopId: string | null;
  loading: boolean;
  onSelectStop: (id: string) => void;
  /** Not offered for Customize walks (the walker chose the stops). */
  onTryAnother?: () => void;
  onEdit: () => void;
  /** Share a link to this walk (only for walks the server gave a share token). */
  onShare?: () => void;
  /** e.g. "Link copied" after sharing. */
  shareStatus?: string | null;
  /** Save / un-save this walk on the device. */
  onToggleSave?: () => void;
  saved?: boolean;
};

/** Badge for each stop: food and extra stops get an icon; sights are numbered 1, 2, 3… skipping those. */
export function stopBadges(stops: WalkStop[]): string[] {
  let n = 0;
  return stops.map((s) => stopEmoji(s.kind) ?? String(++n));
}

export default function ResultsPanel(props: Props) {
  const { walk, selectedStopId, loading, onSelectStop, onTryAnother, onEdit, onShare, shareStatus, onToggleSave, saved } = props;
  const badges = stopBadges(walk.stops);
  return (
    <div className="flex flex-col gap-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-2 text-center">
        <Stat label="Distance" value={formatMiles(walk.distanceMeters)} />
        <Stat label="Walking time" value={formatDuration(walk.durationSeconds)} />
        <Stat label="Stops" value={String(walk.stops.length)} />
      </div>
      <p className="-mt-2 text-center text-xs text-muted">
        {walk.custom ? (
          <>Your sights in the best order. </>
        ) : (
          <>
            You asked for {formatMiles(walk.targetMeters)}
            {walk.withinTarget ? " ✓" : ""}.{" "}
          </>
        )}
        Time is Google&apos;s estimate at an easy pace.
      </p>

      {walk.note && <p className="rounded-lg bg-ochre/15 px-3 py-2 text-sm text-ink">{walk.note}</p>}

      {/* Stop list: start → stops → back to start */}
      <ol className="relative flex flex-col">
        <StopRow badge="▶" badgeClass="bg-zinc-800" title={walk.start.name} subtitle="Start" />
        {walk.stops.map((stop, i) => (
          <li key={stop.id}>
            <button
              type="button"
              onClick={() => onSelectStop(stop.id)}
              className={`flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition hover:bg-paper-2 ${
                selectedStopId === stop.id ? "bg-sage" : ""
              }`}
            >
              <Badge text={badges[i]} className={stopColor(stop.kind)} />
              <span className="min-w-0">
                <span className="block font-medium leading-5 text-ink">{stop.name}</span>
                {stop.detail && <span className="block text-xs text-muted">{stop.detail}</span>}
              </span>
            </button>
          </li>
        ))}
        <StopRow badge="■" badgeClass="bg-zinc-800" title={walk.start.name} subtitle="Back to start" />
      </ol>

      <div className={`grid gap-2 ${onTryAnother ? "grid-cols-2" : "grid-cols-1"}`}>
        {onTryAnother && (
          <button
            type="button"
            onClick={onTryAnother}
            disabled={loading}
            className="rounded-full bg-forest px-3 py-3 font-display text-base font-medium text-on-forest shadow-sm transition hover:bg-forest-2 disabled:cursor-wait disabled:opacity-70"
          >
            {loading ? "Finding another…" : "↻ Try another"}
          </button>
        )}
        <button
          type="button"
          onClick={onEdit}
          className="rounded-xl border border-line bg-paper px-3 py-3 text-sm font-semibold text-ink transition hover:bg-paper-2"
        >
          {walk.shared ? "✎ Plan your own" : walk.custom ? "✎ Edit picks" : "✎ Edit walk"}
        </button>
      </div>
      {walk.share && (onShare || onToggleSave) && (
        <div className="grid grid-cols-2 gap-2">
          {onToggleSave && (
            <button
              type="button"
              onClick={onToggleSave}
              aria-pressed={saved}
              className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                saved ? "border-ochre bg-ochre/15 text-ink" : "border-forest bg-paper text-forest hover:bg-sage"
              }`}
            >
              {saved ? "★ Saved" : "⭐ Save"}
            </button>
          )}
          {onShare && (
            <button
              type="button"
              onClick={onShare}
              className="rounded-xl border border-forest bg-paper px-3 py-3 text-sm font-semibold text-forest transition hover:bg-sage"
            >
              {shareStatus ?? "🔗 Share"}
            </button>
          )}
        </div>
      )}
      <a
        href={googleMapsDirectionsUrl(walk.start.location, walk.stops)}
        target="_blank"
        rel="noreferrer"
        className="text-center text-sm font-medium text-forest underline-offset-2 hover:underline"
      >
        Open in Google Maps for turn-by-turn directions ↗
      </a>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-paper-2 px-2 py-2.5">
      <div className="font-display text-xl font-medium tabular-nums text-forest">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
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
        <span className="block font-medium leading-5 text-ink">{title}</span>
        <span className="block text-xs text-muted">{subtitle}</span>
      </span>
    </li>
  );
}
