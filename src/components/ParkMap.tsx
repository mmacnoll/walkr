"use client";

import { AdvancedMarker, AdvancedMarkerAnchorPoint, APILoadingStatus, APIProvider, InfoWindow, Map, useApiLoadingStatus, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useState } from "react";
import type { Entrance, Park, Sight } from "@/lib/types";
import type { PhotoRef, WalkResult } from "@/lib/walk";
import PlacePhoto from "./PlacePhoto";
import ParkBoundary from "./ParkBoundary";
import { stopBadge } from "./ResultsPanel";
import RouteLine from "./RouteLine";

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
  /** The generated walk, if any. */
  walk?: WalkResult | null;
  /** Results view: show only the walk (hide other dots). */
  focusOnWalk?: boolean;
  selectedStopId?: string | null;
  onSelectStop?: (id: string | null) => void;
};

export default function ParkMap(props: Props) {
  const { park, sights, selectedEntranceId, onSelectEntrance, bottomPadding = 0, walk, focusOnWalk, selectedStopId, onSelectStop } = props;
  const [openSight, setOpenSight] = useState<Sight | null>(null);

  if (!API_KEY) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-zinc-600">
        Map unavailable: NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is not set.
      </div>
    );
  }

  const showPoints = !(walk && focusOnWalk);
  const selectedStop = walk?.stops.find((s) => s.id === selectedStopId) ?? null;

  return (
    <APIProvider apiKey={API_KEY}>
      <MapLoadProblem />
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
        onClick={() => {
          setOpenSight(null);
          onSelectStop?.(null);
        }}
      >
        <ParkBoundary park={park} bottomPadding={bottomPadding} fit={!walk} />
        {walk && <RouteLine encodedPolyline={walk.encodedPolyline} bottomPadding={bottomPadding} />}

        {showPoints && (
          <PointMarkers
            sights={sights}
            entrances={park.entrances}
            selectedEntranceId={selectedEntranceId}
            openSightId={openSight?.placeId}
            onSelectSight={setOpenSight}
            onSelectEntrance={onSelectEntrance}
          />
        )}

        {/* The walk: start marker + numbered stops */}
        {walk && (
          <>
            <AdvancedMarker position={walk.start.location} title={`Start: ${walk.start.name}`} zIndex={10}>
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-green-700 text-xs font-bold text-white shadow-md">
                ▶
              </div>
            </AdvancedMarker>
            {walk.stops.map((stop, i) => {
              const food = stop.kind === "coffee" || stop.kind === "lunch";
              const selected = stop.id === selectedStopId;
              return (
                <AdvancedMarker
                  key={stop.id}
                  position={stop.location}
                  title={stop.name}
                  zIndex={selected ? 30 : 20}
                  onClick={() => onSelectStop?.(stop.id)}
                >
                  <div
                    className={`flex items-center justify-center rounded-full border-2 border-white font-bold text-white shadow-md transition-transform ${
                      food ? "bg-amber-500" : "bg-blue-600"
                    } ${selected ? "h-9 w-9 text-sm" : "h-7 w-7 text-xs"}`}
                  >
                    {stopBadge(stop, i)}
                  </div>
                </AdvancedMarker>
              );
            })}
          </>
        )}

        {selectedStop && (
          <>
            <PanTo position={selectedStop.location} />
            <InfoWindow position={selectedStop.location} onCloseClick={() => onSelectStop?.(null)} pixelOffset={[0, -20]} headerDisabled>
              <div className="w-52 overflow-hidden text-sm text-zinc-900">
                <p className="font-semibold">{selectedStop.name}</p>
                {selectedStop.detail && <p className="text-xs text-zinc-500">{selectedStop.detail}</p>}
                <PlacePhoto photo={selectedStop.photo} alt={selectedStop.name} />
              </div>
            </InfoWindow>
          </>
        )}

        {showPoints && openSight && <SightInfo sight={openSight} onClose={() => setOpenSight(null)} />}
      </Map>
    </APIProvider>
  );
}

/**
 * Sight and entrance dots. They grow as you zoom in: small when the whole park is in view (so a
 * big park isn't one blob), full size with a 44 px tap area once you're zoomed in to pick one.
 */
function PointMarkers(props: {
  sights: Sight[];
  entrances: Entrance[];
  selectedEntranceId?: string;
  openSightId?: string;
  onSelectSight: (s: Sight) => void;
  onSelectEntrance?: (e: Entrance) => void;
}) {
  const { sights, entrances, selectedEntranceId, openSightId, onSelectSight, onSelectEntrance } = props;
  const zoom = useZoom();
  const level = dotLevel(zoom);
  const sightDot = ["h-2.5 w-2.5 border", "h-3.5 w-3.5 border-2", "h-[18px] w-[18px] border-2"][level];
  const tapArea = ["h-5 w-5", "h-8 w-8", "h-11 w-11"][level];
  return (
    <>
      {sights.map((s) => {
        const open = s.placeId === openSightId;
        return (
          <AdvancedMarker
            key={s.placeId}
            position={s.location}
            anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
            zIndex={open ? 5 : 0}
            onClick={() => onSelectSight(s)}
          >
            <div className={`flex items-center justify-center ${tapArea}`}>
              <div
                className={`rounded-full border-white shadow-md ${s.moods.includes("scenic") ? "bg-violet-600" : "bg-teal-600"} ${
                  s.inPark ? "" : "opacity-70"
                } ${open ? "h-6 w-6 border-2" : sightDot}`}
              />
            </div>
          </AdvancedMarker>
        );
      })}
      {entrances.map((e) => {
        const selected = e.id === selectedEntranceId;
        const size = selected
          ? ["h-4 w-4", "h-5 w-5", "h-6 w-6"][level]
          : e.popular
            ? ["h-3 w-3", "h-4 w-4", "h-5 w-5"][level]
            : ["h-2 w-2", "h-3 w-3", "h-3.5 w-3.5"][level];
        return (
          <AdvancedMarker
            key={e.id}
            position={e.location}
            title={`Entrance: ${e.name}`}
            anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
            zIndex={selected ? 3 : e.popular ? 2 : 1}
            onClick={() => onSelectEntrance?.(e)}
          >
            <div className={`flex items-center justify-center ${tapArea}`}>
              <div className={`${size} rounded-full border-2 border-white shadow-md ${selected ? "bg-green-800" : "bg-green-500"}`} />
            </div>
          </AdvancedMarker>
        );
      })}
    </>
  );
}

/** 0 = zoomed out (whole big park), 1 = in between, 2 = zoomed in (street level). */
export function dotLevel(zoom: number | undefined): 0 | 1 | 2 {
  if (zoom === undefined || zoom < 15) return 0;
  return zoom < 16 ? 1 : 2;
}

function useZoom(): number | undefined {
  const map = useMap();
  const [zoom, setZoom] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (!map) return;
    const update = () => setZoom(map.getZoom());
    update();
    const listener = map.addListener("zoom_changed", update);
    return () => listener.remove();
  }, [map]);
  return zoom;
}

/** Friendly message if Google Maps itself can't load (bad key, website not allowed, no internet). */
function MapLoadProblem() {
  const status = useApiLoadingStatus();
  const [authFailed, setAuthFailed] = useState(false);
  useEffect(() => {
    // Google calls this global function when it rejects the browser key (e.g. website not allowed).
    const w = window as unknown as { gm_authFailure?: () => void };
    w.gm_authFailure = () => setAuthFailed(true);
    return () => {
      delete w.gm_authFailure;
    };
  }, []);
  const keyProblem = authFailed || status === APILoadingStatus.AUTH_FAILURE;
  if (!keyProblem && status !== APILoadingStatus.FAILED) return null;
  return (
    <div role="alert" className="absolute inset-0 z-20 flex items-center justify-center bg-zinc-100/95 p-6 text-center">
      <div className="max-w-xs">
        <p className="font-semibold text-zinc-900">The map couldn&apos;t load.</p>
        <p className="mt-1 text-sm text-zinc-600">
          {keyProblem
            ? "Google Maps didn't accept this site. If you run Walkr, check the browser key's allowed websites."
            : "Check your internet connection and reload the page."}
        </p>
      </div>
    </div>
  );
}

/** Smoothly centers the map on a point (used when a stop is picked from the list). */
function PanTo({ position }: { position: { lat: number; lng: number } }) {
  const map = useMap();
  useEffect(() => {
    map?.panTo(position);
  }, [map, position]);
  return null;
}

type SightDetails = { placeId: string; name?: string; type?: string; photo?: PhotoRef; error?: string };

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
    <InfoWindow position={sight.location} onCloseClick={onClose} pixelOffset={[0, -12]} headerDisabled>
      <div className="w-52 overflow-hidden text-sm text-zinc-900">
        <p className="font-semibold">{current ? (current.name ?? current.error) : "Loading…"}</p>
        {current?.type && <p className="text-xs text-zinc-500">{current.type}</p>}
        <p className="mt-1 text-xs text-zinc-500">
          {sight.moods.join(" · ")}
          {sight.inPark ? "" : " · just outside the park"}
        </p>
        {current?.name && <PlacePhoto photo={current.photo} alt={current.name} />}
      </div>
    </InfoWindow>
  );
}
