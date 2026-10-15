// Builds a walk: plan stops → (coffee/lunch: find a place) → measure with the Routes API → retry.
// The Google calls are passed in (`deps`) so this can be tested without the network.
import { getSights } from "@/data/sights";
import { CUSTOM_DETOUR, orderLoop } from "./customWalk";
import { addExtraStops, fountainsMayBeOff, MAX_ROUTE_STOPS } from "./extraStops";
import { distanceMeters, isWithinRingsBuffer } from "./geo";
import { adjustLoop, type Candidate, DEFAULT_DETOUR, fallbackCircle, insertCheapest, loopStraightMeters, MAX_SIGHT_STOPS, planLoop, seededRandom } from "./loop";
import { hasWaterfront, measureRoute, type PathStats, type Preference, preferenceBonus, preferenceScore } from "./pathPrefs";
import type { FoodPlace, PlaceSummary } from "./places";
import type { RouteWaypoint, WalkingRoute } from "./routes";
import { scoreFood, scoreLandmark, scoreSight } from "./scoring";
import type { Entrance, ExtraStop, LatLng, Mood, Park, Refreshment } from "./types";
import { EXTRA_STOPS, isExtraStop, isRefreshment, LENGTH_TOLERANCE, refreshmentNoun, type WalkResult, type WalkStop } from "./walk";

export type WalkDeps = {
  computeRoute: (start: LatLng, stops: RouteWaypoint[]) => Promise<WalkingRoute>;
  searchFood: (kind: Refreshment, center: LatLng, radiusMeters: number) => Promise<FoodPlace[]>;
  getPlaceSummary: (placeId: string) => Promise<PlaceSummary>;
};

export type WalkOptions = {
  park: Park;
  entrance: Entrance;
  mood: Mood;
  /** Optional coffee / lunch / sweet-treat stop. */
  refreshment?: Refreshment;
  /** Optional restroom / water / playground / dog run stops. */
  extras?: ExtraStop[];
  /** Optional "well lit" / "waterfront" preferences. */
  prefs?: Preference[];
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
/** With a preference on, also try this many other loops and keep the best fit. */
const PREFERENCE_ALTERNATIVES = 2;
const DEFAULT_TIME_BUDGET_MS = 10_000;
const FOOD_EDGE_BUFFER_M = { large: 250, small: 600, linear: 600 }; // "about 2 blocks" for big parks

const miles = (m: number) => `${(m / 1609.344).toFixed(1)} mi`;

/** Adds the requested extra stops to a loop (as planner candidates), plus notes about any that couldn't be added. */
function withExtras(park: Park, start: LatLng, stops: Candidate[], extras: ExtraStop[]): { stops: Candidate[]; notes: string[] } {
  if (!extras.length) return { stops, notes: [] };
  const result = addExtraStops(park.id, start, stops, extras);
  // Extra places come back without a planner score; they're required, so the score doesn't matter.
  const full = result.stops.map((s): Candidate => ("score" in s ? s : { ...s, score: 0 }));
  const notes: string[] = [];
  if (result.missing.length) {
    const nouns = result.missing.map((k) => EXTRA_STOPS.find((x) => x.id === k)!.noun);
    const list = nouns.length > 1 ? `${nouns.slice(0, -1).join(", ")} or ${nouns.at(-1)}` : nouns[0];
    notes.push(`There's no ${list} in or right next to ${park.name}, so the walk skips ${nouns.length > 1 ? "them" : "it"}.`);
  }
  if (extras.includes("water") && !result.missing.includes("water") && fountainsMayBeOff())
    notes.push("NYC Parks turns most drinking fountains off from about November to April, so it may not be running.");
  return { stops: full, notes };
}

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
  kind: Refreshment,
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
  const { park, entrance, mood, refreshment, targetMeters } = opts;
  const extras = opts.extras ?? [];
  // Google's cheaper tier: at most 10 stops in all, so extra stops take the place of sights.
  const maxSights = Math.max(1, Math.min(MAX_SIGHT_STOPS, MAX_ROUTE_STOPS - (refreshment ? 1 : 0) - extras.length));
  const startedAt = Date.now();
  const budget = opts.timeBudgetMs ?? DEFAULT_TIME_BUDGET_MS;
  const start = entrance.location;
  const rng = seededRandom(opts.seed);
  const avoid = new Set(opts.avoid ?? []);
  const prefs = (opts.prefs ?? []).filter((p) => p !== "water" || hasWaterfront(park.id));
  const plainCandidates = sightCandidates(park, mood);
  // Sights on lit paths / near the water get a small bonus, so the planner leans that way.
  const candidates = prefs.length ? plainCandidates.map((c) => ({ ...c, score: c.score + preferenceBonus(park.id, c.location, prefs) })) : plainCandidates;
  const notes: string[] = [];

  const detour = DEFAULT_DETOUR;
  const firstPlan = planLoop({ start, targetMeters, candidates, detour, rng, avoid, maxStops: maxSights });

  // Coffee / lunch: find one good, open place near the far end of the loop.
  let food: Awaited<ReturnType<typeof findFoodStop>> = null;
  if (refreshment) {
    const what = refreshmentNoun(refreshment);
    try {
      food = await findFoodStop(deps, park, refreshment, firstPlan?.turnaround.location ?? park.center, start);
      if (!food) notes.push(`Couldn't find a well-rated ${what} open near this route, so here's the walk without one.`);
    } catch (err) {
      // Don't fail the whole walk if the café search is down or over its daily limit.
      console.error("Food search failed:", err);
      notes.push(`Couldn't look up ${what}s right now, so here's the walk without one.`);
    }
  }

  const attempts: NonNullable<WalkResult["attempts"]> = [];
  // Extra stops add walking, so plan the sights for a little less than the full length.
  const extraMeters = (core: Candidate[]) => loopStraightMeters(start, withExtras(park, start, core, extras).stops) - loopStraightMeters(start, core);
  const coreTarget = (core: Candidate[], d: number) => Math.max(targetMeters * 0.4, targetMeters - extraMeters(core) * d);
  const off = (route: WalkingRoute) => Math.abs(route.distanceMeters - targetMeters);

  // Plan once, then measure with the Routes API and fine-tune: each round makes one small change
  // (drop / add / swap a stop) using the winding factor measured for this exact loop.
  async function buildLoop(seed: number, maxAttempts: number, startDetour: number, pool: Candidate[] = candidates) {
    let detour = startDetour;
    let best: { route: WalkingRoute; stops: Candidate[] } | null = null;
    const firstTarget = firstPlan ? coreTarget(firstPlan.stops, detour) : targetMeters;
    const plan = planLoop({ start, targetMeters: firstTarget, candidates: pool, detour, rng: seededRandom(seed), avoid, required: food?.candidate, maxStops: maxSights });
    let stops = plan?.stops ?? [];
    let circle = plan ? null : fallbackCircle(start, park.center, targetMeters, detour);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0 && Date.now() - startedAt > budget) break; // out of time: keep the closest loop so far
      const full = circle ? [] : withExtras(park, start, stops, extras).stops;
      const waypoints: RouteWaypoint[] = circle
        ? circle.map((location) => ({ location }))
        : full.map((s) => (s.placeId ? { placeId: s.placeId, location: s.location } : { location: s.location }));
      const straight = loopStraightMeters(start, circle ? circle.map((location) => ({ location })) : full);

      const route = await deps.computeRoute(start, waypoints);
      attempts.push({ detour: Number(detour.toFixed(2)), estimatedMeters: Math.round(straight * detour), actualMeters: route.distanceMeters, stops: full.length || stops.length });
      if (!best || off(route) < off(best.route)) best = { route, stops: circle ? stops : full };
      if (off(route) <= targetMeters * LENGTH_TOLERANCE) break;

      detour = Math.min(3, Math.max(1, route.distanceMeters / Math.max(straight, 1)));
      if (circle) {
        circle = fallbackCircle(start, park.center, targetMeters, detour);
        continue;
      }
      const next = adjustLoop({ start, stops, candidates: pool, targetMeters: coreTarget(stops, detour), detour, requiredId: food?.candidate.id, maxStops: maxSights + (food ? 1 : 0) });
      if (next === stops) break; // no change would get closer
      stops = next;
    }
    return { best, detour, planned: plan?.stops };
  }

  const main = await buildLoop(opts.seed, MAX_ROUTE_ATTEMPTS, DEFAULT_DETOUR);
  let best = main.best;
  if (main.planned) notes.push(...withExtras(park, start, main.planned, extras).notes);

  // Well lit / waterfront: try a couple of other loops and keep the one that best fits the
  // preference while still matching the length (a few extra Routes calls, only when asked).
  let stats = best && prefs.length ? measureRoute(park.id, best.route.encodedPolyline) : null;
  for (let alt = 1; alt <= PREFERENCE_ALTERNATIVES && best && prefs.length && candidates.length; alt++) {
    if (Date.now() - startedAt > budget) break;
    // The first alternative is exactly the walk you would get without a preference (same seed, no nudge),
    // so turning a preference on can never make the result worse.
    const other = (alt === 1 ? await buildLoop(opts.seed, 2, DEFAULT_DETOUR, plainCandidates) : await buildLoop(opts.seed + alt * 7919, 2, main.detour)).best;
    if (!other) continue;
    const otherStats = measureRoute(park.id, other.route.encodedPolyline);
    const fits = (r: WalkingRoute) => off(r) <= targetMeters * LENGTH_TOLERANCE;
    const better =
      (fits(other.route) && !fits(best.route)) ||
      (fits(other.route) === fits(best.route) && preferenceScore(otherStats, prefs) > preferenceScore(stats, prefs) + 3);
    if (better) [best, stats] = [other, otherStats];
  }
  if (!best) throw new Error("No route attempts were made");
  notes.push(...preferenceNotes(park.id, prefs, stats));
  if (!candidates.length) notes.push("We couldn't find sights for this park, so this is a simple loop.");

  const withinTarget = Math.abs(best.route.distanceMeters - targetMeters) <= targetMeters * LENGTH_TOLERANCE;
  if (!withinTarget) notes.push(`This loop is ${miles(best.route.distanceMeters)}, the closest we could get to ${miles(targetMeters)}.`);

  const namedStops = await nameStops(best.stops, food?.place, deps, opts.includeNames);

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
    pathStats: stats ?? undefined,
    prefs: prefs.length ? prefs : undefined,
    attempts,
  };
}

/** Honest notes about what the lit / waterfront numbers mean. */
function preferenceNotes(parkId: string, prefs: Preference[], stats: PathStats | null): string[] {
  const notes: string[] = [];
  if (prefs.includes("lit"))
    notes.push(
      `Lighting comes from OpenStreetMap's volunteer map${stats ? ` (${stats.litPct}% of this walk is on paths marked lit)` : ""}, so it isn't guaranteed. Most NYC parks close at 1 AM, and some smaller ones at dusk.`,
    );
  if (prefs.includes("water") && !hasWaterfront(parkId)) notes.push("This park isn't next to the water, so the waterfront preference was skipped.");
  return notes;
}

/** Names (and photos) for the final stops, looked up live: Google's terms don't let us store names. */
async function nameStops(stops: Candidate[], foodPlace: FoodPlace | undefined, deps: WalkDeps, includeNames = true): Promise<WalkStop[]> {
  return Promise.all(
    stops.map(async (s): Promise<WalkStop> => {
      if (isRefreshment(s.kind) && foodPlace) {
        const p = foodPlace;
        const detail = [p.type, p.rating ? `${p.rating.toFixed(1)}★` : null].filter(Boolean).join(" · ");
        return { id: s.id, name: p.name, location: s.location, kind: s.kind, placeId: s.placeId, detail, photo: p.photo };
      }
      if (s.kind === "landmark") return { id: s.id, name: s.name ?? "Landmark", location: s.location, kind: s.kind };
      if (isExtraStop(s.kind)) return { id: s.id, name: s.name ?? s.kind, detail: s.detail, location: s.location, kind: s.kind };
      if (!includeNames || !s.placeId) return { id: s.id, name: "Sight", location: s.location, kind: s.kind, placeId: s.placeId };
      try {
        const summary = await deps.getPlaceSummary(s.placeId);
        return { id: s.id, name: summary.name, detail: summary.type, photo: summary.photo, location: s.location, kind: s.kind, placeId: s.placeId };
      } catch {
        return { id: s.id, name: "Sight", location: s.location, kind: s.kind, placeId: s.placeId };
      }
    }),
  );
}

export type CustomWalkOptions = {
  park: Park;
  entrance: Entrance;
  /** Sights the walker picked (already checked to belong to this park). */
  placeIds: string[];
  refreshment?: Refreshment;
  extras?: ExtraStop[];
  /** Customize: the walker chose the stops, so preferences are only measured and reported. */
  prefs?: Preference[];
  includeNames?: boolean;
};

/** Customize mode: the walker's picks in the shortest loop order (+ optional food stop), one Routes call. */
export async function generateCustomWalk(opts: CustomWalkOptions, deps: WalkDeps): Promise<WalkResult> {
  const { park, entrance, refreshment: foodKind } = opts;
  const start = entrance.location;
  const sights = new Map(getSights(park.id).map((s) => [s.placeId, s]));
  const picks: Candidate[] = opts.placeIds.flatMap((id) => {
    const s = sights.get(id);
    return s ? [{ id, placeId: id, location: s.location, score: 1, kind: "sight" as const }] : [];
  });
  if (!picks.length) throw new Error("No valid sights picked");
  let stops = orderLoop(start, picks);
  const notes: string[] = [];

  let food: Awaited<ReturnType<typeof findFoodStop>> = null;
  if (foodKind) {
    const what = refreshmentNoun(foodKind);
    // Look near the stop farthest from the start (roughly the middle of the walk).
    const far = stops.reduce((a, b) => (distanceMeters(start, b.location) > distanceMeters(start, a.location) ? b : a));
    try {
      food = await findFoodStop(deps, park, foodKind, far.location, start);
      if (food) stops = insertCheapest(start, stops, food.candidate);
      else notes.push(`Couldn't find a well-rated ${what} open near your picks, so here's the walk without one.`);
    } catch (err) {
      console.error("Food search failed:", err);
      notes.push(`Couldn't look up ${what}s right now, so here's the walk without one.`);
    }
  }

  const added = withExtras(park, start, stops, opts.extras ?? []);
  stops = added.stops;
  notes.push(...added.notes);
  const route = await deps.computeRoute(start, stops.map((s) => (s.placeId ? { placeId: s.placeId, location: s.location } : { location: s.location })));
  const namedStops = await nameStops(stops, food?.place, deps, opts.includeNames);
  if (opts.prefs?.length) notes.push(...preferenceNotes(park.id, opts.prefs, measureRoute(park.id, route.encodedPolyline)));
  return {
    parkId: park.id,
    start: { name: entrance.name, location: start },
    stops: namedStops,
    encodedPolyline: route.encodedPolyline,
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    targetMeters: route.distanceMeters,
    withinTarget: true,
    custom: true,
    pathStats: opts.prefs?.length ? (measureRoute(park.id, route.encodedPolyline) ?? undefined) : undefined,
    prefs: opts.prefs?.length ? opts.prefs : undefined,
    note: notes.length ? notes.join(" ") : undefined,
    attempts: [{ detour: Number((route.distanceMeters / Math.max(1, loopStraightMeters(start, stops))).toFixed(2)), estimatedMeters: Math.round(loopStraightMeters(start, stops) * CUSTOM_DETOUR), actualMeters: route.distanceMeters, stops: stops.length }],
  };
}
