import type { LatLng, Mood } from "./types";

/** Average walking pace used to convert minutes ↔ miles: 3 mph = 20 minutes per mile. */
export const MINUTES_PER_MILE = 20;
export const METERS_PER_MILE = 1609.344;

export type LengthUnit = "min" | "mi";

/** Slider limits for each unit (they cover the same range: 10–90 min = 0.5–4.5 mi). */
export const LENGTH_LIMITS: Record<LengthUnit, { min: number; max: number; step: number }> = {
  min: { min: 10, max: 90, step: 5 },
  mi: { min: 0.5, max: 4.5, step: 0.25 },
};

export const DEFAULT_MINUTES = 30;

export const MOODS: { id: Mood; label: string; emoji: string; description: string }[] = [
  { id: "scenic", label: "Scenic", emoji: "🌅", description: "Landmarks, views, bridges and water" },
  { id: "quiet", label: "Quiet", emoji: "🌿", description: "Gardens, meadows and calmer paths" },
  { id: "coffee", label: "Coffee Stop", emoji: "☕", description: "A café on or near the way" },
  { id: "lunch", label: "Lunch Spot", emoji: "🥪", description: "A place to eat, roughly mid-walk" },
];

/** What the form sends to the route generator (M5). */
export type WalkRequest = {
  parkId: string;
  entranceId: string;
  mood: Mood;
  /** Target loop length. The generator aims for ±15%. */
  distanceMeters: number;
};

export function minutesToMiles(minutes: number): number {
  return minutes / MINUTES_PER_MILE;
}

export function milesToMinutes(miles: number): number {
  return miles * MINUTES_PER_MILE;
}

export function minutesToMeters(minutes: number): number {
  return Math.round(minutesToMiles(minutes) * METERS_PER_MILE);
}

/** Snap a value to the slider's step and keep it within limits. */
export function snapToSlider(value: number, unit: LengthUnit): number {
  const { min, max, step } = LENGTH_LIMITS[unit];
  const snapped = Math.round(value / step) * step;
  return Math.min(max, Math.max(min, Number(snapped.toFixed(2))));
}

/** "30 min · 1.5 mi" */
export function describeLength(minutes: number): string {
  const miles = minutesToMiles(minutes);
  return `${Math.round(minutes)} min · ${Number(miles.toFixed(2))} mi`;
}

export type WalkStop = {
  id: string;
  name: string;
  location: LatLng;
  kind: "sight" | "landmark" | "coffee" | "lunch";
  placeId?: string;
  /** e.g. "Sculpture", "Coffee shop · 4.6★" */
  detail?: string;
};

/** What /api/route sends back. */
export type WalkResult = {
  parkId: string;
  start: { name: string; location: LatLng };
  stops: WalkStop[];
  encodedPolyline: string;
  distanceMeters: number;
  durationSeconds: number;
  targetMeters: number;
  /** Within ±15% of the requested length. */
  withinTarget: boolean;
  /** Friendly explanation when something didn't go perfectly. */
  note?: string;
  /** How each planning round went (for testing and tuning). */
  attempts?: { detour: number; estimatedMeters: number; actualMeters: number; stops: number }[];
};

export const LENGTH_TOLERANCE = 0.15;
export const MIN_TARGET_METERS = 800;
export const MAX_TARGET_METERS = 7500;

/** "2.4 mi" */
export function formatMiles(meters: number): string {
  return `${(meters / METERS_PER_MILE).toFixed(1)} mi`;
}

/** "51 min", "1 hr 5 min" */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/**
 * Link that opens the loop in Google Maps for turn-by-turn walking directions.
 * Google Maps links accept up to 9 waypoints; extra stops are skipped evenly.
 */
export function googleMapsDirectionsUrl(start: LatLng, stops: { location: LatLng }[]): string {
  const ll = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
  let points = stops.map((s) => s.location);
  if (points.length > 9) points = Array.from({ length: 9 }, (_, i) => points[Math.round((i * (points.length - 1)) / 8)]);
  const params = new URLSearchParams({ api: "1", origin: ll(start), destination: ll(start), travelmode: "walking" });
  if (points.length) params.set("waypoints", points.map(ll).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
