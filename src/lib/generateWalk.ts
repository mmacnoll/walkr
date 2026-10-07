// Builds a walk: plan stops → (coffee/lunch: find a place) → measure with the Routes API → retry.
// The Google calls are passed in (`deps`) so this can be tested without the network.
import { getSights } from "@/data/sights";
import { distanceMeters, isWithinRingsBuffer } from "./geo";
import { adjustLoop, type Candidate, DEFAULT_DETOUR, fallbackCircle, loopStraightMeters, planLoop, seededRandom } from "./loop";
import type { FoodPlace, PlaceSummary } from "./places";
import type { RouteWaypoint, WalkingRoute } from "./routes";
import { scoreFood, scoreLandmark, scoreSight } from "./scoring";
import type { Entrance, LatLng, Mood, Park } from "./types";
import { LENGTH_TOLERANCE, type WalkResult, type WalkStop } from "./walk";

export type WalkDeps = {
  computeRoute: (start: LatLng, stops: RouteWaypoint[]) => Promise<WalkingRoute>;
  searchFood: (kind: "coffee" | "lunch", center: LatLng, radiusMeters: number) => Promise<FoodPlace[]>;
  getPlaceSummary: (placeId: string) => Promise<PlaceSummary>;
};

export type WalkOptions = {
  park: Park;
  entrance: Entrance;
  mood: Mood;
  targetMeters: number;
  seed: number;
  /** Stop ids from the previous walk ("Try another"). */
  avoid?: string[];
  /** Look up names of the stops (skipped by the test script to save calls). */
  includeNames?: boolean;
  /** Stop fine-tuning after this long and return the closest loop so far (the browser gives up at 15 s). */
  timeBudgetMs?: number;
};

const MAX_ROUTE_ATTEMPTS = 4;
const DEFAULT_TIME_BUDGET_MS = 10_000;
const FOOD_EDGE_BUFFER_M = { large: 250, small: 600, linear: 600 }; // "about 2 blocks" for big parks

const miles = (m: number) => `${(m / 1609.344).toFixed(1)} mi`;

function sightCandidates(park: Park, mood: Mood): Candidate[] {
  const sights = getSights(park.id);
  if (sights.length)
    return sights.map((s) => ({ id: s.placeId, placeId: s.placeId, location: s.location, score: scoreSight(s, mood), kind: "sight" as const }));
  // No Google sights for this park: fall back to our hand-picked landmarks.
  return park.landmarks.map((l) => ({ id: l.id, name: l.name, location: l.location, score: scoreLandmark(l, mood), kind: "landmark" as const }));
}

async function findFoodStop(
  deps: WalkDeps,
  park: Park,
  kind: "coffee" | "lunch",
  near: LatLng,
  start: LatLng,
): Promise<{ candidate: Candidate; place: FoodPlace } | null> {
  const buffer = FOOD_EDGE_BUFFER_M[park.kind];
  // First look near the far end of the loop; if nothing good, look near the start.
  for (const [center, radius] of [
    [near, 600],
    [start, 500],
  ] as const) {
    const places = await deps.searchFood(kind, center, radius);
    const ranked = places
      .filter((p) => isWithinRingsBuffer(p.location, park.boundary, buffer))
      .map((p) => ({ p, score: scoreFood(p, distanceMeters(center, p.location)) }))
      .filter((x) => x.score > -Infinity)
      .sort((a, b) => b.score - a.score);
    if (ranked.length) {
      const p = ranked[0].p;
      return { place: p, candidate: { id: p.placeId, placeId: p.placeId, name: p.name, location: p.location, score: 1, kind } };
    }
  }
  return null;
}

export async function generateWalk(opts: WalkOptions, deps: WalkDeps): Promise<WalkResult> {
  const { park, entrance, mood, targetMeters } = opts;
  const startedAt = Date.now();
  const budget = opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const start = entrance.location;
  const rng = seededRandom(opts.seed);
  const avoid = new Set(opts.avoid ?? []);
  const candidates = sightCandidates(park, mood);
  const notes: string[] = [];

  let detour = DEFAULT_DETOUR;
  const firstPlan = planLoop({ start, targetMeters, candidates, detour, rng, avoid });

  // Coffee / lunch: find one good, open place near the far end of the loop.
  let food: Awaited<ReturnType<typeof findFoodStop>> = null;
  if (mood === "coffee" || mood === "lunch") {
    const what = mood === "coffee" ? "café" : "lunch spot";
    try {
      food = await findFoodStop(deps, park, mood, firstPlan?.turnaround.location ?? park.center, start);
      if (!food) notes.push(`Couldn't find a well-rated ${what} open near this route, so here's the walk without one.`);
    } catch (err) {
      // Don't fail the whole walk if the café search is down or over its daily limit.
      console.error("Food search failed:", err);
      notes.push(`Couldn't look up ${what}s right now, so here's the walk without one.`);
    }
  }

  // Plan once, then measure with the Routes API and fine-tune: each round makes one small change
  // (drop / add / swap a stop) using the winding factor measured for this exact loop.
  let best: { route: WalkingRoute; stops: Candidate[] } | null = null;
  const attempts: NonNullable<WalkResult["attempts"]> = [];
  const plan = planLoop({ start, targetMeters, candidates, detour, rng: seededRandom(opts.seed), avoid, required: food?.candidate });
  let stops = plan?.stops ?? [];
  let circle = plan ? null : fallbackCircle(start, park.center, targetMeters, detour);
  for (let attempt = 0; attempt < MAX_ROUTE_ATTEMPTS; attempt++) {
    if (attempt > 0 && Date.now() - startedAt > budget) break; // out of time: keep the closest loop so far
    const waypoints: RouteWaypoint[] = circle
      ? circle.map((location) => ({ location }))
      : stops.map((s) => (s.placeId ? { placeId: s.placeId } : { location: s.location }));
    const straight = loopStraightMeters(start, circle ? circle.map((location) => ({ location })) : stops);

    const route = await deps.computeRoute(start, waypoints);
    attempts.push({ detour: Number(detour.toFixed(2)), estimatedMeters: Math.round(straight * detour), actualMeters: route.distanceMeters, stops: stops.length });
    if (!best || Math.abs(route.distanceMeters - targetMeters) < Math.abs(best.route.distanceMeters - targetMeters)) best = { route, stops };
    if (Math.abs(route.distanceMeters - targetMeters) <= targetMeters * LENGTH_TOLERANCE) break;

    detour = Math.min(3, Math.max(1, route.distanceMeters / Math.max(straight, 1)));
    if (circle) {
      circle = fallbackCircle(start, park.center, targetMeters, detour);
      continue;
    }
    const next = adjustLoop({ start, stops, candidates, targetMeters, detour, requiredId: food?.candidate.id });
    if (next === stops) break; // no change would get closer
    stops = next;
  }
  if (!best) throw new Error("No route attempts were made");
  if (!candidates.length) notes.push("We couldn't find sights for this park, so this is a simple loop.");

  const withinTarget = Math.abs(best.route.distanceMeters - targetMeters) <= targetMeters * LENGTH_TOLERANCE;
  if (!withinTarget) notes.push(`This loop is ${miles(best.route.distanceMeters)}, the closest we could get to ${miles(targetMeters)}.`);

  // Names: looked up live for Google sights (we're not allowed to store them).
  const namedStops: WalkStop[] = await Promise.all(
    best.stops.map(async (s): Promise<WalkStop> => {
      if (s.kind === "coffee" || s.kind === "lunch") {
        const p = food!.place;
        const detail = [p.type, p.rating ? `${p.rating.toFixed(1)}★` : null].filter(Boolean).join(" · ");
        return { id: s.id, name: p.name, location: s.location, kind: s.kind, placeId: s.placeId, detail, photo: p.photo };
      }
      if (s.kind === "landmark") return { id: s.id, name: s.name ?? "Landmark", location: s.location, kind: s.kind };
      if (opts.includeNames === false || !s.placeId) return { id: s.id, name: "Sight", location: s.location, kind: s.kind, placeId: s.placeId };
      try {
        const summary = await deps.getPlaceSummary(s.placeId);
        return { id: s.id, name: summary.name, detail: summary.type, photo: summary.photo, location: s.location, kind: s.kind, placeId: s.placeId };
      } catch {
        return { id: s.id, name: "Sight", location: s.location, kind: s.kind, placeId: s.placeId };
      }
    }),
  );

  return {
    parkId: park.id,
    start: { name: entrance.name, location: start },
    stops: namedStops,
    encodedPolyline: best.route.encodedPolyline,
    distanceMeters: best.route.distanceMeters,
    durationSeconds: best.route.durationSeconds,
    targetMeters,
    withinTarget,
    note: notes.length ? notes.join(" ") : undefined,
    attempts,
  };
}
