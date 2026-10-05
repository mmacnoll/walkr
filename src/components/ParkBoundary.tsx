"use client";

import { useMap } from "@vis.gl/react-google-maps";
import { useEffect } from "react";
import type { Park } from "@/lib/types";

/** Draws the park outline and zooms the map to fit it whenever the park changes. */
export default function ParkBoundary({ park }: { park: Park }) {
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

    const bounds = new google.maps.LatLngBounds();
    park.boundary.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 48);

    return () => outline.setMap(null);
  }, [map, park]);

  return null;
}
