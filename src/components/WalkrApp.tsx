"use client";

import { useEffect, useRef, useState } from "react";
import { defaultEntrance, parks } from "@/data/parks";
import { getSights } from "@/data/sights";
import type { Mood } from "@/lib/types";
import { DEFAULT_MINUTES, describeLength, type LengthUnit, MOODS, minutesToMeters, type WalkRequest } from "@/lib/walk";
import ParkMap from "./ParkMap";
import WalkForm from "./WalkForm";

export default function WalkrApp() {
  const [parkId, setParkId] = useState(parks[0].id);
  const park = parks.find((p) => p.id === parkId) ?? parks[0];
  const [entranceId, setEntranceId] = useState(defaultEntrance(park).id);
  const entrance = park.entrances.find((e) => e.id === entranceId) ?? defaultEntrance(park);
  const [minutes, setMinutes] = useState(DEFAULT_MINUTES);
  const [unit, setUnit] = useState<LengthUnit>("min");
  const [mood, setMood] = useState<Mood>("scenic");
  const [collapsed, setCollapsed] = useState(false); // phone bottom sheet only
  const [notice, setNotice] = useState<string | null>(null);

  // On phones the form sheet covers the bottom of the map; tell the map so the park isn't hidden under it.
  const sheetRef = useRef<HTMLElement>(null);
  const [mapBottomPadding, setMapBottomPadding] = useState(0);
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const update = () => setMapBottomPadding(desktop.matches ? 0 : sheet.offsetHeight);
    const observer = new ResizeObserver(update);
    observer.observe(sheet);
    desktop.addEventListener("change", update);
    update();
    return () => {
      observer.disconnect();
      desktop.removeEventListener("change", update);
    };
  }, []);

  function changePark(id: string) {
    const next = parks.find((p) => p.id === id) ?? parks[0];
    setParkId(next.id);
    setEntranceId(defaultEntrance(next).id); // a new park starts at its default entrance
  }

  function generate() {
    const request: WalkRequest = { parkId: park.id, entranceId: entrance.id, mood, distanceMeters: minutesToMeters(minutes) };
    // Route generation arrives in M5; for now, show what would be sent.
    console.log("Walk request:", request);
    setNotice(`Ready: ${describeLength(minutes)} ${MOODS.find((m) => m.id === mood)?.label} walk from ${entrance.name}. Route drawing comes in M5.`);
    setCollapsed(true);
  }

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 5000);
    return () => clearTimeout(t);
  }, [notice]);

  const moodInfo = MOODS.find((m) => m.id === mood);

  return (
    <div className="relative flex h-full w-full flex-col md:flex-row">
      {/* Form: bottom sheet on phones, sidebar on wider screens */}
      <aside
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 z-10 max-h-[78dvh] overflow-y-auto rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] text-zinc-900 shadow-[0_-6px_24px_rgba(0,0,0,0.15)] md:static md:order-first md:h-full md:max-h-none md:w-[380px] md:shrink-0 md:rounded-none md:border-r md:border-zinc-200 md:shadow-none"
      >
        {/* Sheet header: tap to collapse/expand on phones */}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-expanded={!collapsed}
          aria-controls="walk-form"
          className="sticky top-0 z-10 flex w-full flex-col items-center gap-2 bg-white px-4 pb-3 pt-2 md:pointer-events-none md:pt-5"
        >
          <span aria-hidden className="h-1.5 w-10 rounded-full bg-zinc-300 md:hidden" />
          <span className="flex w-full items-center justify-between">
            <span className="text-left">
              <span className="block text-lg font-bold text-green-800">Walkr</span>
              <span className="block text-xs text-zinc-500">
                {collapsed ? `${park.name} · ${describeLength(minutes)} · ${moodInfo?.emoji} ${moodInfo?.label}` : "Loop walks through NYC parks"}
              </span>
            </span>
            <span className="text-xs font-medium text-green-800 md:hidden">{collapsed ? "Edit" : "Hide"}</span>
          </span>
        </button>

        <div id="walk-form" className={`px-4 pb-5 ${collapsed ? "hidden md:block" : ""}`}>
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
            onSubmit={generate}
          />
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
        />

        {/* Legend + required OpenStreetMap credit */}
        <div className="absolute left-3 top-3 rounded-md bg-white/90 px-2 py-1 text-[11px] leading-4 text-zinc-700 shadow">
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
          <div className="text-[10px] text-zinc-500">
            Outlines &amp; entrances ©{" "}
            <a className="underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
              OpenStreetMap
            </a>
          </div>
        </div>

        {notice && (
          <div role="status" className="absolute inset-x-3 top-16 mx-auto max-w-md rounded-lg bg-zinc-900/90 px-4 py-3 text-sm text-white shadow-lg">
            {notice}
          </div>
        )}
      </div>
    </div>
  );
}
