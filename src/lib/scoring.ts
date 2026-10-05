// How well a stop fits the chosen mood. Used by the loop planner.
import type { FoodPlace } from "./places";
import type { Landmark, Mood, Sight } from "./types";

/** Sights: matching the mood counts most; being inside the park is a bonus. */
export function scoreSight(sight: Pick<Sight, "moods" | "inPark">, mood: Mood): number {
  let score: number;
  if (mood === "scenic") score = sight.moods.includes("scenic") ? 1 : 0.35;
  else if (mood === "quiet") score = sight.moods.includes("quiet") ? 1 : 0.3;
  // Coffee/lunch walks: any sight is nice along the way; scenic ones slightly more.
  else score = sight.moods.includes("scenic") ? 0.8 : 0.7;
  return score + (sight.inPark ? 0.25 : 0);
}

/** Hand-picked backup landmarks (used only if a park has no Google sights). */
export function scoreLandmark(landmark: Pick<Landmark, "moods">, mood: Mood): number {
  return landmark.moods.includes(mood) ? 1.1 : 0.5;
}

/**
 * Cafés / lunch places: well-rated, plenty of reviews, open now, and close to where we want
 * the stop (`distanceMeters` from the ideal spot). Returns -Infinity for places to skip.
 */
export function scoreFood(place: Pick<FoodPlace, "rating" | "ratingCount" | "openNow">, distanceMeters: number): number {
  if (place.openNow === false) return -Infinity;
  if (place.rating < 4.0 || place.ratingCount < 25) return -Infinity;
  return place.rating + Math.log10(place.ratingCount) * 0.3 - distanceMeters / 1000;
}
