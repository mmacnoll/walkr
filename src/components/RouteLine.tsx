"use client";

import { decode } from "@googlemaps/polyline-codec";
import { useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";

/** Draws the walking route and zooms the map to show all of it. */
export default function RouteLine({ encodedPolyline, bottomPadding = 0 }: { encodedPolyline: string; bottomPadding?: number }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    const path = decode(encodedPolyline).map(([lat, lng]) => ({ lat, lng }));
    // A white casing under a blue line keeps the route readable over busy map areas.
    const casing = new google.maps.Polyline({ map, path, strokeColor: "#ffffff", strokeOpacity: 0.9, strokeWeight: 8, zIndex: 1 });
    const line = new google.maps.Polyline({ map, path, strokeColor: "#2563eb", strokeOpacity: 1, strokeWeight: 4.5, zIndex: 2 });

    const bounds = new google.maps.LatLngBounds();
    path.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, { top: 56, left: 24, right: 24, bottom: bottomPadding + 24 });

    return () => {
      casing.setMap(null);
      line.setMap(null);
    };
  }, [map, encodedPolyline, bottomPadding]);

  return null;
}
