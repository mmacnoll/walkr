"use client";

import { AdvancedMarker, APIProvider, InfoWindow, Map } from "@vis.gl/react-google-maps";
import { useEffect, useState } from "react";
import type { Entrance, Park, Sight } from "@/lib/types";
import ParkBoundary from "./ParkBoundary";

// Browser key: restricted to Maps JavaScript API + our domains, so it's safe to expose.
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;

type Props = {
  park: Park;
  sights: Sight[];
  selectedEntranceId?: string;
  onSelectEntrance?: (entrance: Entrance) => void;
  /** Pixels of map hidden under the phone bottom sheet. */
  bottomPadding?: number;
};

export default function ParkMap({ park, sights, selectedEntranceId, onSelectEntrance, bottomPadding = 0 }: Props) {
  const [openSight, setOpenSight] = useState<Sight | null>(null);

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
        onClick={() => setOpenSight(null)}
      >
        <ParkBoundary park={park} bottomPadding={bottomPadding} />

        {sights.map((s) => (
          <AdvancedMarker key={s.placeId} position={s.location} onClick={() => setOpenSight(s)}>
            <div
              className={`h-2.5 w-2.5 rounded-full border border-white shadow ${
                s.moods.includes("scenic") ? "bg-violet-600" : "bg-teal-600"
              } ${s.inPark ? "" : "opacity-60"}`}
            />
          </AdvancedMarker>
        ))}

        {park.entrances.map((e) => {
          const selected = e.id === selectedEntranceId;
          const size = selected ? "h-4 w-4" : e.popular ? "h-3 w-3" : "h-2 w-2";
          return (
            <AdvancedMarker
              key={e.id}
              position={e.location}
              title={`Entrance: ${e.name}`}
              zIndex={selected ? 3 : e.popular ? 2 : 1}
              onClick={() => onSelectEntrance?.(e)}
            >
              <div className={`${size} rounded-full border-2 border-white shadow ${selected ? "bg-green-800" : "bg-green-500"}`} />
            </AdvancedMarker>
          );
        })}

        {openSight && <SightInfo sight={openSight} onClose={() => setOpenSight(null)} />}
      </Map>
    </APIProvider>
  );
}

type SightDetails = { placeId: string; name?: string; type?: string; error?: string };

/** Popup with the sight's name, looked up live from Google (names can't be stored). */
function SightInfo({ sight, onClose }: { sight: Sight; onClose: () => void }) {
  const [details, setDetails] = useState<SightDetails | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/place/${encodeURIComponent(sight.placeId)}`)
      .then((r) => r.json())
      .then((json) => !cancelled && setDetails({ placeId: sight.placeId, ...json }))
      .catch(() => !cancelled && setDetails({ placeId: sight.placeId, error: "Couldn't load the name." }));
    return () => {
      cancelled = true;
    };
  }, [sight.placeId]);

  const current = details?.placeId === sight.placeId ? details : null;
  return (
    <InfoWindow position={sight.location} onCloseClick={onClose} pixelOffset={[0, -6]} headerDisabled>
      <div className="max-w-52 text-sm text-zinc-900">
        <p className="font-semibold">{current ? (current.name ?? current.error) : "Loading…"}</p>
        {current?.type && <p className="text-xs text-zinc-500">{current.type}</p>}
        <p className="mt-1 text-xs text-zinc-500">
          {sight.moods.join(" · ")}
          {sight.inPark ? "" : " · just outside the park"}
        </p>
      </div>
    </InfoWindow>
  );
}
