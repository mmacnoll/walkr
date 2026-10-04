"use client";

import { APIProvider, Map } from "@vis.gl/react-google-maps";

// Browser key: restricted to Maps JavaScript API + our domains, so it's safe to expose.
const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
const MAP_ID = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;

// Temporary until park data lands in M3.
const CENTRAL_PARK = { lat: 40.7829, lng: -73.9654 };

export default function ParkMap() {
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
        defaultCenter={CENTRAL_PARK}
        defaultZoom={14}
        // "greedy" lets one finger pan the map on phones (no "use two fingers" overlay).
        gestureHandling="greedy"
        disableDefaultUI
        zoomControl
        clickableIcons={false}
      />
    </APIProvider>
  );
}
