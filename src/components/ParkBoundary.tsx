"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import type { Park } from "@/lib/types";

/** Draws the park outline and zooms the map to fit it whenever the park changes. */
export default function ParkBoundary({ park, bottomPadding = 0, fit = true }: { park: Park; bottomPadding?: number; fit?: boolean }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;

    const outline = new google.maps.Polygon({
      map,
      paths: park.boundary,
      strokeColor: "#15803d",
      strokeOpacity: 0.9,
      strokeWeight: 2,
      fillColor: "#22c55e",
      fillOpacity: 0.12,
      clickable: false,
    });

    return () => outline.setMap(null);
  }, [map, park]);

  // Zoom to the park when it changes, leaving room for the phone bottom sheet.
  useEffect(() => {
    if (!map || !fit) return;
    const bounds = new google.maps.LatLngBounds();
    park.boundary.flat().forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, { top: 56, left: 24, right: 24, bottom: bottomPadding + 24 });
  }, [map, park, bottomPadding, fit]);

  return null;
}
