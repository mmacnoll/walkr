// Extra stops (restroom, water, playground, dog run): add the one of each kind that adds the
// least walking to a loop. Pure and client-safe, so Customize mode's tracker can use it too.
import { getAmenities } from "@/data/amenities";
import { distanceMeters } from "./geo";
import type { ExtraStop, LatLng } from "./types";

/** Google's cheaper Routes tier allows 10 stops between start and finish. */
export const MAX_ROUTE_STOPS = 10;

export type ExtraCandidate = { id: string; kind: ExtraStop; name: string; detail: string; location: LatLng };

type Located = { location: LatLng };

/** Where inserting `p` into start → stops → start adds the least distance, and how much. */
function cheapestInsertion(start: LatLng, stops: Located[], p: LatLng): { index: number; cost: number } {
  let best = { index: 0, cost: Infinity };
  for (let i = 0; i <= stops.length; i++) {
    const prev = i === 0 ? start : stops[i - 1].location;
    const next = i === stops.length ? start : stops[i].location;
    const cost = distanceMeters(prev, p) + distanceMeters(p, next) - distanceMeters(prev, next);
    if (cost < best.cost) best = { index: i, cost };
  }
  return best;
}

/**
 * Adds one stop of each requested kind, choosing the place (and position) that adds the least
 * walking. Kinds with no place near this park are reported in `missing`.
 */
export function addExtraStops<T extends Located>(
  parkId: string,
  start: LatLng,
  stops: T[],
  extras: ExtraStop[],
): { stops: (T | ExtraCandidate)[]; missing: ExtraStop[] } {
  let route: (T | ExtraCandidate)[] = [...stops];
  const missing: ExtraStop[] = [];
  for (const kind of extras) {
    let best: { place: ExtraCandidate; index: number; cost: number } | null = null;
    for (const a of getAmenities(parkId, kind)) {
      const { index, cost } = cheapestInsertion(start, route, a.location);
      if (!best || cost < best.cost) best = { place: { ...a, kind }, index, cost };
    }
    if (!best) {
      missing.push(kind);
      continue;
    }
    route = [...route.slice(0, best.index), best.place, ...route.slice(best.index)];
  }
  return { stops: route, missing };
}

/** Kinds that have at least one place near this park (to grey out the others in the form). */
export function availableExtras(parkId: string): Set<ExtraStop> {
  return new Set((["restroom", "water", "playground", "dogrun"] as const).filter((k) => getAmenities(parkId, k).length > 0));
}

/** NYC Parks turns most drinking fountains off for the cold months. */
export function fountainsMayBeOff(date = new Date()): boolean {
  const month = Number(new Intl.DateTimeFormat("en-US", { month: "numeric", timeZone: "America/New_York" }).format(date));
  return month >= 11 || month <= 4;
}
