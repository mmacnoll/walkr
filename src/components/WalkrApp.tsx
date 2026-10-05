"use client";

import { useState } from "react";
import { defaultEntrance, parks } from "@/data/parks";
import { getSights } from "@/data/sights";
import ParkMap from "./ParkMap";

export default function WalkrApp() {
  const [parkId, setParkId] = useState(parks[0].id);
  const park = parks.find((p) => p.id === parkId) ?? parks[0];
  const [entranceId, setEntranceId] = useState(defaultEntrance(park).id);
  const entrance = park.entrances.find((e) => e.id === entranceId) ?? defaultEntrance(park);

  function changePark(id: string) {
    const next = parks.find((p) => p.id === id) ?? parks[0];
    setParkId(next.id);
    setEntranceId(defaultEntrance(next).id);
  }

  return (
    <div className="relative h-full w-full">
      <ParkMap
        park={park}
        sights={getSights(park.id)}
        selectedEntranceId={entrance.id}
        onSelectEntrance={(e) => setEntranceId(e.id)}
      />

      {/* Temporary park picker for M3; replaced by the full form in M4. */}
      <div className="absolute left-3 top-3 max-w-[calc(100%-1.5rem)] rounded-lg bg-white/95 px-3 py-2 text-sm text-zinc-900 shadow">
        <label>
          <span className="sr-only">Park</span>
          <select
            value={parkId}
            onChange={(e) => changePark(e.target.value)}
            className="bg-transparent font-medium outline-none"
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
        </label>
        <p className="mt-0.5 truncate text-xs text-zinc-600">Start: {entrance.name}</p>
      </div>

      {/* Legend + required OpenStreetMap credit */}
      <div className="absolute bottom-6 left-3 rounded-md bg-white/90 px-2 py-1 text-[11px] leading-4 text-zinc-700 shadow">
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
    </div>
  );
}
