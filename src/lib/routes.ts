// Server-side Google Routes API helper (walking directions). Uses the server key.
import type { LatLng } from "./types";

const ROUTES_URL = "https://routes.googleapis.com/directions/v2:computeRoutes";

export type RouteWaypoint = { placeId: string } | { location: LatLng };

export type WalkingRoute = {
  distanceMeters: number;
  durationSeconds: number;
  /** Google's compact encoding of the path; decoded in the browser to draw it. */
  encodedPolyline: string;
};

export class RoutesError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function toApiWaypoint(w: RouteWaypoint) {
  return "placeId" in w
    ? { placeId: w.placeId }
    : { location: { latLng: { latitude: w.location.lat, longitude: w.location.lng } } };
}

/** Walking route from `start`, through `stops` in order, back to `start`. */
export async function computeWalkingLoop(start: LatLng, stops: RouteWaypoint[]): Promise<WalkingRoute> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_SERVER_KEY is not set");

  const res = await fetch(ROUTES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      // Only what we use. Up to 10 stops keeps this in the cheapest pricing tier.
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
    },
    body: JSON.stringify({
      origin: toApiWaypoint({ location: start }),
      destination: toApiWaypoint({ location: start }),
      intermediates: stops.map(toApiWaypoint),
      travelMode: "WALK",
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new RoutesError(json.error?.message ?? `Routes API HTTP ${res.status}`, res.status);
  const route = json.routes?.[0];
  if (!route) throw new RoutesError("No walking route found", 404);
  return {
    distanceMeters: route.distanceMeters,
    durationSeconds: parseInt(String(route.duration ?? "0").replace("s", ""), 10),
    encodedPolyline: route.polyline.encodedPolyline,
  };
}
