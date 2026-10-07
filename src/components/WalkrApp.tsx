"use client";

import { type CSSProperties, type PointerEvent, useEffect, useRef, useState } from "react";
import { defaultEntrance, parks } from "@/data/parks";
import { getSights } from "@/data/sights";
import { fetchWalk, WalkError } from "@/lib/fetchWalk";
import { clampHeight, settle, type Snap, type SnapHeights, snapHeights, toggle } from "@/lib/sheet";
import type { Mood } from "@/lib/types";
import {
  DEFAULT_MINUTES,
  describeLength,
  formatDuration,
  formatMiles,
  type LengthUnit,
  MOODS,
  minutesToMeters,
  type WalkRequest,
  type WalkResult,
} from "@/lib/walk";
import ParkMap from "./ParkMap";
import ResultsPanel from "./ResultsPanel";
import WalkForm from "./WalkForm";

type View = "form" | "results";

export default function WalkrApp() {
  const [parkId, setParkId] = useState(parks[0].id);
  const park = parks.find((p) => p.id === parkId) ?? parks[0];
  const [entranceId, setEntranceId] = useState(defaultEntrance(park).id);
  const entrance = park.entrances.find((e) => e.id === entranceId) ?? defaultEntrance(park);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [unit, setUnit] = useState<LengthUnit>("min");
  const [mood, setMood] = useState<Mood>("scenic");
  const [snap, setSnap] = useState<Snap>("full"); // phone bottom sheet only
  const collapsed = snap === "peek";
  const [error, setError] = useState<{ message: string; retry?: () => void } | null>(null);
  const [walk, setWalk] = useState<WalkResult | null>(null);
  const [view, setView] = useState<View>("form");
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Phone bottom sheet: rests at peek / half / full and follows the finger while dragged.
  // (null heights = desktop, where it's a sidebar instead.)
  const headerRef = useRef<HTMLButtonElement>(null);
  const [heights, setHeights] = useState<SnapHeights | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);
  const drag = useRef<{ startY: number; startHeight: number; height: number; lastY: number; lastT: number; velocity: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 768px)");
    const update = () =>
      setHeights(desktop.matches ? null : snapHeights(window.innerHeight, headerRef.current?.offsetHeight ?? 64));
    update();
    window.addEventListener("resize", update);
    desktop.addEventListener("change", update);
    return () => {
      window.removeEventListener("resize", update);
      desktop.removeEventListener("change", update);
    };
  }, []);
  // The map only hears about the height once the sheet settles (re-fitting on every frame would jump).
  const mapBottomPadding = heights ? heights[snap] : 0;
  const sheetHeight = heights ? (dragHeight ?? heights[snap]) : undefined;

  function onSheetPointerDown(e: PointerEvent<HTMLButtonElement>) {
    if (!heights) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // keep getting moves if the finger leaves the header
    } catch {}
    drag.current = { startY: e.clientY, startHeight: heights[snap], height: heights[snap], lastY: e.clientY, lastT: e.timeStamp, velocity: 0, moved: false };
  }
  function onSheetPointerMove(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    if (!d || !heights) return;
    if (!d.moved && Math.abs(e.clientY - d.startY) < 6) return; // still a tap
    d.moved = true;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) d.velocity = (d.lastY - e.clientY) / dt; // up = positive
    d.lastY = e.clientY;
    d.lastT = e.timeStamp;
    d.height = clampHeight(d.startHeight + (d.startY - e.clientY), heights);
    setDragHeight(d.height);
  }
  function onSheetPointerUp(e: PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    drag.current = null;
    if (!d?.moved || !heights) return;
    // A pause before lifting the finger isn't a flick.
    const velocity = e.timeStamp - d.lastT > 100 ? 0 : d.velocity;
    setSnap(settle(d.height, velocity, snap, heights));
    setDragHeight(null);
    suppressClick.current = true; // the browser still fires a click after a drag
  }

  function changePark(id: string) {
    const next = parks.find((p) => p.id === id) ?? parks[0];
    setParkId(next.id);
    setEntranceId(defaultEntrance(next).id); // a new park starts at its default entrance
    setWalk(null);
  }

  async function generate(options: { avoid?: string[] } = {}) {
    const request: WalkRequest & { avoid?: string[] } = {
      parkId: park.id,
      entranceId: entrance.id,
      mood,
      distanceMeters: minutesToMeters(minutes),
      avoid: options.avoid,
    };
    setLoading(true);
    setError(null);
    try {
      const result: WalkResult = await fetchWalk(request);
      setWalk(result);
      setSelectedStopId(null);
      setView("results");
      setSnap("half"); // route on the map above, stops below
    } catch (err) {
      const e = err instanceof WalkError ? err : new WalkError("Something went wrong. Please try again.", true);
      setError({ message: e.message, retry: e.retryable ? () => generate(options) : undefined });
    } finally {
      setLoading(false);
    }
  }

  function selectStop(id: string | null) {
    setSelectedStopId(id);
    if (id) setSnap("peek"); // phones: get the sheet out of the way so the stop is visible
  }

  const moodInfo = MOODS.find((m) => m.id === mood);
  const showResults = view === "results" && walk;
  const summary = showResults
    ? `${formatMiles(walk.distanceMeters)} · ${formatDuration(walk.durationSeconds)} · ${walk.stops.length} stops`
    : `${park.name} · ${describeLength(minutes)} · ${moodInfo?.emoji} ${moodInfo?.label}`;

  return (
    <div className="relative flex h-full w-full flex-col md:flex-row">
      {/* Form / results: bottom sheet on phones, sidebar on wider screens */}
      <aside
        style={sheetHeight === undefined ? undefined : ({ "--sheet-h": `${sheetHeight}px` } as CSSProperties)}
        className={`absolute inset-x-0 bottom-0 z-10 h-[var(--sheet-h)] overflow-y-auto overscroll-contain rounded-t-2xl ${dragHeight === null ? "transition-[height] duration-300 ease-out motion-reduce:transition-none" : ""} bg-white pb-[env(safe-area-inset-bottom)] text-zinc-900 shadow-[0_-6px_24px_rgba(0,0,0,0.15)] md:static md:order-first md:h-full md:max-h-none md:w-[380px] md:shrink-0 md:rounded-none md:border-r md:border-zinc-200 md:shadow-none md:transition-none`}
      >
        {/* Sheet header: drag to resize, or tap to open/close (phones) */}
        <button
          ref={headerRef}
          type="button"
          onPointerDown={onSheetPointerDown}
          onPointerMove={onSheetPointerMove}
          onPointerUp={onSheetPointerUp}
          onPointerCancel={() => {
            drag.current = null;
            setDragHeight(null);
          }}
          onClick={() => {
            if (suppressClick.current) {
              suppressClick.current = false;
              return;
            }
            setSnap(toggle(snap));
          }}
          aria-expanded={!collapsed}
          aria-controls="sheet-body"
          className="sticky top-0 z-10 flex w-full touch-none cursor-grab flex-col items-center gap-2 bg-white px-4 pb-3 pt-2 select-none active:cursor-grabbing md:pointer-events-none md:pt-5"
        >
          <span aria-hidden className="h-1.5 w-10 rounded-full bg-zinc-300 md:hidden" />
          <span className="flex w-full items-center justify-between">
            <span className="text-left">
              <span className="block text-lg font-bold text-green-800">{showResults ? `Your walk in ${park.name}` : "Walkr"}</span>
              <span className="block text-xs text-zinc-500">{collapsed || showResults ? summary : "Loop walks through NYC parks"}</span>
            </span>
            <span className="text-xs font-medium text-green-800 md:hidden">{collapsed ? "Show" : "Hide"}</span>
          </span>
        </button>

        <div id="sheet-body" className="px-4 pb-5" inert={collapsed && heights !== null}>
          {showResults ? (
            <ResultsPanel
              walk={walk}
              selectedStopId={selectedStopId}
              loading={loading}
              onSelectStop={selectStop}
              onTryAnother={() => generate({ avoid: walk.stops.map((s) => s.id) })}
              onEdit={() => {
                setView("form");
                setSelectedStopId(null);
              }}
            />
          ) : (
            <WalkForm
              park={park}
              entranceId={entrance.id}
              minutes={minutes}
              unit={unit}
              mood={mood}
              onParkChange={changePark}
              onEntranceChange={setEntranceId}
              onMinutesChange={setMinutes}
              onUnitChange={setUnit}
              onMoodChange={setMood}
              onSubmit={() => generate()}
              loading={loading}
            />
          )}
        </div>
      </aside>

      {/* Map */}
      <div className="relative h-full min-w-0 flex-1">
        <ParkMap
          park={park}
          sights={getSights(park.id)}
          selectedEntranceId={entrance.id}
          onSelectEntrance={(e) => setEntranceId(e.id)}
          bottomPadding={mapBottomPadding}
          walk={walk?.parkId === park.id ? walk : null}
          focusOnWalk={view === "results"}
          selectedStopId={selectedStopId}
          onSelectStop={selectStop}
        />

        {/* Legend + required OpenStreetMap credit */}
        <div className="absolute left-3 top-3 rounded-md bg-white/90 px-2 py-1 text-[11px] leading-4 text-zinc-700 shadow">
          {showResults ? (
            <>
              <span className="mr-2 inline-flex items-center gap-1">
                <i className="inline-block h-2 w-2 rounded-full bg-green-700" />
                Start
              </span>
              <span className="mr-2 inline-flex items-center gap-1">
                <i className="inline-block h-2 w-2 rounded-full bg-blue-600" />
                Stop
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="inline-block h-2 w-2 rounded-full bg-amber-500" />
                Food
              </span>
            </>
          ) : (
            <>
              <span className="mr-2 inline-flex items-center gap-1">
                <i className="inline-block h-2 w-2 rounded-full bg-green-500" />
                Entrance
              </span>
              <span className="mr-2 inline-flex items-center gap-1">
                <i className="inline-block h-2 w-2 rounded-full bg-violet-600" />
                Scenic
              </span>
              <span className="inline-flex items-center gap-1">
                <i className="inline-block h-2 w-2 rounded-full bg-teal-600" />
                Quiet
              </span>
            </>
          )}
          <div className="text-[10px] text-zinc-500">
            Outlines &amp; entrances ©{" "}
            <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>
          </div>
        </div>

        {loading && (
          <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center" role="status" aria-live="polite">
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-medium text-zinc-800 shadow-lg">
              <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-green-700 border-t-transparent" />
              Finding a loop…
            </div>
          </div>
        )}

        {error && !loading && (
          <div role="alert" className="absolute inset-x-3 top-16 mx-auto flex max-w-md items-start gap-3 rounded-lg bg-red-700 px-4 py-3 text-sm text-white shadow-lg">
            <p className="flex-1">{error.message}</p>
            {error.retry && (
              <button type="button" onClick={error.retry} className="shrink-0 rounded-md bg-white/20 px-2.5 py-1 font-semibold hover:bg-white/30">
                Try again
              </button>
            )}
            <button type="button" onClick={() => setError(null)} aria-label="Dismiss" className="shrink-0 px-1 text-lg leading-none opacity-80 hover:opacity-100">
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
