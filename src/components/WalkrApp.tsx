"use client";

import { useState } from "react";
import { defaultEntrance, parks } from "@/data/parks";
import ParkMap from "./ParkMap";

export default function WalkrApp() {
  const [parkId, setParkId] = useState(parks[0].id);
  const park = parks.find((p) => p.id === parkId) ?? parks[0];

  return (
    <div className="relative h-full w-full">
      <ParkMap park={park} selectedEntranceId={defaultEntrance(park).id} />

      {/* Temporary park picker for M3; replaced by the full form in M4. */}
      <label className="absolute left-3 top-3 rounded-lg bg-white/95 px-3 py-2 text-sm text-zinc-900 shadow">
        <span className="sr-only">Park</span>
        <select
          value={parkId}
          onChange={(e) => setParkId(e.target.value)}
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
    </div>
  );
}
