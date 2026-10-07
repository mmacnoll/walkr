// Customize mode: the walker picks the sights; we put them in the best order and estimate the walk.
// Pure functions, used both in the browser (live tracker) and on the server (building the walk).
import { distanceMeters } from "./geo";
import { loopStraightMeters } from "./loop";
import type { LatLng } from "./types";
import { METERS_PER_MILE } from "./walk";

/** Google's cheaper Routes tier allows 10 stops in between start and finish. */
export const MAX_CUSTOM_STOPS = 10;
/** Room for one café or lunch stop if asked. */
export function maxPicks(withFood: boolean): number {
  return withFood ? MAX_CUSTOM_STOPS - 1 : MAX_CUSTOM_STOPS;
}

/**
 * Calibrated on 24 real custom walks across all 12 parks (scripts/custom-matrix.mjs, 2026-10-07):
 * real paths wind ~1.25× the straight line, and Google's walking times average 22.4 min per mile.
 */
export const CUSTOM_DETOUR = 1.25;
export const GOOGLE_MINUTES_PER_MILE = 22.4;

/** A food stop is found later, near the route; the tracker allows this much extra for the detour. */
export const FOOD_DETOUR_ESTIMATE_M = 250;

type Point = { location: LatLng };

/**
 * Orders stops into the shortest loop from `start` and back.
 * Up to 8 stops: tries every order (exact). More: nearest-neighbor, then 2-opt clean-up.
 */
export function orderLoop<T extends Point>(start: LatLng, stops: T[]): T[] {
  if (stops.length <= 2) return [...stops];
  if (stops.length <= 8) return bruteForce(start, stops);
  return twoOpt(start, nearestNeighbor(start, stops));
}

function bruteForce<T extends Point>(start: LatLng, stops: T[]): T[] {
  let best: T[] = stops;
  let bestLen = Infinity;
  const used = new Array(stops.length).fill(false);
  const path: T[] = [];
  // Depth-first over all orders, skipping any partial path already longer than the best.
  const visit = (len: number, at: LatLng) => {
    if (len >= bestLen) return;
    if (path.length === stops.length) {
      const total = len + distanceMeters(at, start);
      if (total < bestLen) {
        bestLen = total;
        best = [...path];
      }
      return;
    }
    for (let i = 0; i < stops.length; i++) {
      if (used[i]) continue;
      used[i] = true;
      path.push(stops[i]);
      visit(len + distanceMeters(at, stops[i].location), stops[i].location);
      path.pop();
      used[i] = false;
    }
  };
  visit(0, start);
  return best;
}

function nearestNeighbor<T extends Point>(start: LatLng, stops: T[]): T[] {
  const left = [...stops];
  const out: T[] = [];
  let at = start;
  while (left.length) {
    let bi = 0;
    for (let i = 1; i < left.length; i++) if (distanceMeters(at, left[i].location) < distanceMeters(at, left[bi].location)) bi = i;
    const [next] = left.splice(bi, 1);
    out.push(next);
    at = next.location;
  }
  return out;
}

/** Repeatedly reverses a stretch of the loop whenever that makes it shorter (removes crossings). */
function twoOpt<T extends Point>(start: LatLng, stops: T[]): T[] {
  let route = [...stops];
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, j + 1).reverse(), ...route.slice(j + 1)];
        if (loopStraightMeters(start, candidate) + 0.01 < loopStraightMeters(start, route)) {
          route = candidate;
          improved = true;
        }
      }
    }
  }
  return route;
}

export type CustomEstimate = { meters: number; minutes: number };

/** Live tracker: straight-line loop × typical path winding, plus a little for a food detour, at Google's pace. */
export function estimateCustomWalk(start: LatLng, orderedStops: Point[], withFood: boolean, detour = CUSTOM_DETOUR): CustomEstimate {
  if (!orderedStops.length) return { meters: 0, minutes: 0 };
  const meters = loopStraightMeters(start, orderedStops) * detour + (withFood ? FOOD_DETOUR_ESTIMATE_M : 0);
  return { meters, minutes: (meters / METERS_PER_MILE) * GOOGLE_MINUTES_PER_MILE };
}
