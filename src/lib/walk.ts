import type { Mood } from "./types";

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
