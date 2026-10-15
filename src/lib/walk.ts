import type { ExtraStop, LatLng, Mood, Refreshment } from "./types";

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
];

export const REFRESHMENTS: { id: Refreshment; label: string; emoji: string; noun: string }[] = [
  { id: "coffee", label: "Coffee", emoji: "☕", noun: "café" },
  { id: "lunch", label: "Lunch", emoji: "🥪", noun: "lunch spot" },
  { id: "treat", label: "Sweet treat", emoji: "🍰", noun: "sweet treat spot" },
];

export const EXTRA_STOPS: { id: ExtraStop; label: string; emoji: string; noun: string }[] = [
  { id: "restroom", label: "Restroom", emoji: "🚻", noun: "restroom" },
  { id: "water", label: "Water", emoji: "💧", noun: "drinking fountain" },
  { id: "playground", label: "Playground", emoji: "🛝", noun: "playground" },
  { id: "dogrun", label: "Dog run", emoji: "🐕", noun: "dog run" },
];

/** Route preferences (see src/lib/pathPrefs.ts). */
export type Preference = "lit" | "water";

export function isExtraStop(kind: unknown): kind is ExtraStop {
  return EXTRA_STOPS.some((x) => x.id === kind);
}

/** Badge color for a stop: amber for refreshments, sky for extra stops, blue for sights. */
export function stopColor(kind: string): string {
  return isRefreshment(kind) ? "bg-amber-500" : isExtraStop(kind) ? "bg-sky-600" : "bg-blue-600";
}

/** Badge for a non-sight stop (refreshment or extra), or undefined for sights. */
export function stopEmoji(kind: string): string | undefined {
  return REFRESHMENTS.find((r) => r.id === kind)?.emoji ?? EXTRA_STOPS.find((x) => x.id === kind)?.emoji;
}

export function isRefreshment(kind: unknown): kind is Refreshment {
  return kind === "coffee" || kind === "lunch" || kind === "treat";
}

/** "café", "lunch spot", "sweet treat spot" */
export function refreshmentNoun(r: Refreshment): string {
  return REFRESHMENTS.find((x) => x.id === r)!.noun;
}

/** What the form sends to the route generator (M5). */
export type WalkRequest = {
  parkId: string;
  entranceId: string;
  mood: Mood;
  refreshment?: Refreshment;
  extras?: ExtraStop[];
  prefs?: Preference[];
  /** Target loop length. The generator aims for ±15%. */
  distanceMeters: number;
};

/** What Customize mode sends to the route generator. */
export type CustomWalkRequest = {
  mode: "custom";
  parkId: string;
  entranceId: string;
  placeIds: string[];
  refreshment?: Refreshment;
  extras?: ExtraStop[];
  prefs?: Preference[];
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
  kind: "sight" | "landmark" | Refreshment | ExtraStop;
  placeId?: string;
  /** e.g. "Sculpture", "Coffee shop · 4.6★" */
  detail?: string;
  photo?: PhotoRef;
};

/** A Google photo the browser can show via /api/photo?t=<token>, plus the credit Google requires. */
export type PhotoRef = {
  token: string;
  credit?: { name: string; uri?: string };
};

export function photoSrc(photo: PhotoRef): string {
  return `/api/photo?t=${encodeURIComponent(photo.token)}`;
}

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
  /** Built in Customize mode from the walker's own picks. */
  custom?: boolean;
  /** With "well lit" / "waterfront" on: how much of the route is lit / along the water (%). */
  pathStats?: { litPct: number; unlitPct: number; waterPct: number };
  /** The preferences this walk was built / measured with. */
  prefs?: Preference[];
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
