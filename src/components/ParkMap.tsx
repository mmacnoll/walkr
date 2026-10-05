"use client";

import { AdvancedMarker, APIProvider, Map } from "@vis.gl/react-google-maps";
import type { Park } from "@/lib/types";
import ParkBoundary from "./ParkBoundary";

// Browser key: restricted to Maps JavaScript API + our domains, so it's safe to expose.
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;

type Props = {
  park: Park;
  selectedEntranceId?: string;
};

export default function ParkMap({ park, selectedEntranceId }: Props) {
  if (!API_KEY) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-600">
        Map unavailable: NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is not set.
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY}>
      <Map
        className="h-full w-full"
        mapId={MAP_ID}
        defaultCenter={park.center}
        defaultZoom={14}
        // "greedy" lets one finger pan the map on phones (no "use two fingers" overlay).
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
      >
        <ParkBoundary park={park} />

        {park.landmarks.map((l) => (
          <AdvancedMarker key={l.id} position={l.location} title={l.name}>
            <div className="h-2.5 w-2.5 rounded-full border border-white bg-zinc-500 shadow" />
          </AdvancedMarker>
        ))}

        {park.entrances.map((e) => {
          const selected = e.id === selectedEntranceId;
          return (
            <AdvancedMarker key={e.id} position={e.location} title={`Entrance: ${e.name}`} zIndex={selected ? 2 : 1}>
              <div
                className={`rounded-full border-2 border-white shadow ${
                  selected ? "h-4 w-4 bg-green-700" : "h-3 w-3 bg-green-500"
                }`}
              />
            </AdvancedMarker>
          );
        })}
      </Map>
    </APIProvider>
  );
}
