// Picks stops for a loop walk of roughly the target length. Pure logic, no API calls, so it's
// easy to test. The Routes API later measures the real walking distance (see app/api/route).
//
// The idea in plain language:
//  1. Pick a "turnaround" stop about half a walk away from the start.
//  2. Add stops on one side of the start→turnaround line for the way out, and on the other side
//     for the way back, so the walk is a loop instead of an out-and-back.
//  3. Estimate the length as straight-line distance × a "detour factor" (paths curve), and keep
//     the plan whose estimate is closest to the target while visiting good stops.
import { bearingDegrees, distanceMeters } from "./geo";
import type { LatLng } from "./types";

export type StopKind = "sight" | "landmark" | "coffee" | "lunch";

export type Candidate = {
  id: string;
  location: LatLng;
  /** How good a stop this is for the chosen mood (roughly 0–1.5). */
  score: number;
  kind: StopKind;
  placeId?: string;
  name?: string;
};

export type PlanInput = {
  start: LatLng;
  targetMeters: number;
  candidates: Candidate[];
  /** Real walking distance ÷ straight-line distance. Starts at 1.3, then measured. */
  detour: number;
  /** Random number generator (seeded, so "Try another" gives a different but repeatable loop). */
  rng: () => number;
  /** Must-visit stop (the café or lunch spot), inserted where it adds the least walking. */
  required?: Candidate;
  /** Stops from the previous loop ("Try another"): still allowed, but less attractive. */
  avoid?: Set<string>;
};

export type Plan = {
  stops: Candidate[];
  turnaround: Candidate;
  estimatedMeters: number;
};

export const DEFAULT_DETOUR = 1.3;
/** Routes API's cheaper tier allows up to 10 in-between stops; keep room for the food stop. */
export const MAX_SIGHT_STOPS = 7;

/** Straight-line length of start → stops → start. */
export function loopStraightMeters(start: LatLng, stops: { location: LatLng }[]): number {
  const pts = [start, ...stops.map((s) => s.location), start];
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += distanceMeters(pts[i], pts[i + 1]);
  return total;
}

/** How many sights to aim for: about one every 700 m of walking, at least 2. */
export function targetStopCount(targetMeters: number): number {
  return Math.max(2, Math.min(MAX_SIGHT_STOPS, Math.round(targetMeters / 700) + 1));
}

// Local flat coordinates (meters) around the start point.
function toXY(origin: LatLng, p: LatLng) {
  const mLat = 111_320;
  const mLng = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return { x: (p.lng - origin.lng) * mLng, y: (p.lat - origin.lat) * mLat };
}

/** Insert a stop where it adds the least extra distance. */
export function insertCheapest(start: LatLng, stops: Candidate[], extra: Candidate): Candidate[] {
  let bestIndex = 0;
  let bestCost = Infinity;
  for (let i = 0; i <= stops.length; i++) {
    const prev = i === 0 ? start : stops[i - 1].location;
    const next = i === stops.length ? start : stops[i].location;
    const cost = distanceMeters(prev, extra.location) + distanceMeters(extra.location, next) - distanceMeters(prev, next);
    if (cost < bestCost) {
      bestCost = cost;
      bestIndex = i;
    }
  }
  return [...stops.slice(0, bestIndex), extra, ...stops.slice(bestIndex)];
}

function buildAround(input: PlanInput, turnaround: Candidate, stopCount: number): Plan {
  const { start, candidates, detour, targetMeters, required, rng } = input;
  const t = toXY(start, turnaround.location);
  const axisLen = Math.hypot(t.x, t.y) || 1;
  const width = Math.max(150, 0.45 * axisLen); // how far to either side of the line we look

  // Sort the others into "way out" (left of the line) and "way back" (right of the line).
  const out: { c: Candidate; along: number; side: number; jitter: number }[] = [];
  const back: typeof out = [];
  for (const c of candidates) {
    if (c.id === turnaround.id || c.id === required?.id) continue;
    const p = toXY(start, c.location);
    const along = (p.x * t.x + p.y * t.y) / (axisLen * axisLen); // 0 = start, 1 = turnaround
    const side = (t.x * p.y - t.y * p.x) / axisLen; // meters left (+) or right (−) of the line
    if (along < 0.08 || along > 0.95 || Math.abs(side) > width) continue;
    (side >= 0 ? out : back).push({ c, along, side, jitter: rng() * 0.35 });
  }

  // Pick the best stop in each stretch of the way, so stops are spread out.
  const perSide = Math.max(0, stopCount - 1);
  const pick = (list: typeof out, n: number) => {
    if (n <= 0 || !list.length) return [] as typeof out;
    const chosen: typeof out = [];
    for (let i = 0; i < n; i++) {
      const lo = 0.08 + (i / n) * 0.87;
      const hi = 0.08 + ((i + 1) / n) * 0.87;
      const inBin = list.filter((x) => x.along >= lo && x.along < hi);
      // Prefer good stops a little off the line (a rounder loop), plus a little randomness for variety.
      const appeal = (x: (typeof list)[number]) => x.c.score + Math.min(1, Math.abs(x.side) / width) * 0.3 + x.jitter;
      const best = inBin.sort((a, b) => appeal(b) - appeal(a))[0];
      if (best) chosen.push(best);
    }
    return chosen;
  };
  const outN = Math.ceil(perSide / 2);
  let outStops = pick(out, outN);
  let backStops = pick(back, perSide - outN);
  // One side empty (e.g. a narrow park): use more stops from the other side.
  if (!outStops.length) backStops = pick(back, perSide);
  if (!backStops.length) outStops = pick(out, perSide);

  let stops = [
    ...outStops.sort((a, b) => a.along - b.along).map((x) => x.c),
    turnaround,
    ...backStops.sort((a, b) => b.along - a.along).map((x) => x.c),
  ];
  if (required) stops = insertCheapest(start, stops, required);

  // Too long? Drop the weakest optional stops until we're close.
  let estimated = loopStraightMeters(start, stops) * detour;
  while (estimated > targetMeters * 1.08) {
    const removable = stops.filter((s) => s.id !== turnaround.id && s.id !== required?.id);
    if (!removable.length) break;
    const weakest = removable.sort((a, b) => a.score - b.score)[0];
    stops = stops.filter((s) => s.id !== weakest.id);
    estimated = loopStraightMeters(start, stops) * detour;
  }
  return { stops, turnaround, estimatedMeters: estimated };
}

/** Plan a loop. Returns null if there are no candidate stops at all. */
export function planLoop(rawInput: PlanInput): Plan | null {
  const avoid = rawInput.avoid ?? new Set<string>();
  const input = {
    ...rawInput,
    candidates: rawInput.candidates.map((c) => (avoid.has(c.id) ? { ...c, score: c.score - 0.8 } : c)),
  };
  const { start, targetMeters, candidates, detour, rng } = input;
  if (!candidates.length && !input.required) return null;
  const pool = candidates.length ? candidates : [input.required!];

  // Ideal turnaround distance: half the walk, as the crow flies, a bit less because a loop bulges.
  const idealReach = (targetMeters / (2 * detour)) * 0.85;
  const turnarounds = pool
    .map((c) => {
      const d = distanceMeters(start, c.location);
      const fit = 1 - Math.min(1, Math.abs(d - idealReach) / idealReach);
      return { c, rank: fit * 2 + c.score + rng() * 0.6 };
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 6)
    .map((x) => x.c);

  const stopCount = targetStopCount(targetMeters);
  let best: { plan: Plan; value: number } | null = null;
  for (const t of turnarounds) {
    const plan = buildAround(input, t, stopCount);
    const lengthError = Math.abs(plan.estimatedMeters - targetMeters) / targetMeters;
    const quality = plan.stops.reduce((sum, s) => sum + s.score, 0) / stopCount;
    const value = quality - lengthError * 4 + rng() * 0.3;
    if (!best || value > best.value) best = { plan, value };
  }
  return best?.plan ?? null;
}

/**
 * No usable stops at all: make a simple loop of plain waypoints on a circle that heads
 * toward `towards` (e.g. the park's center), so the walk stays in or near the park.
 */
export function fallbackCircle(start: LatLng, towards: LatLng, targetMeters: number, detour: number): LatLng[] {
  const radius = targetMeters / (2 * Math.PI * detour);
  const heading = (bearingDegrees(start, towards) * Math.PI) / 180;
  const mLat = 111_320;
  const mLng = 111_320 * Math.cos((start.lat * Math.PI) / 180);
  const center = { x: Math.sin(heading) * radius, y: Math.cos(heading) * radius };
  const points: LatLng[] = [];
  for (const deg of [60, 120, 180, 240, 300]) {
    // Angles measured around the circle's center, starting from the start point.
    const a = heading + Math.PI + (deg * Math.PI) / 180;
    const x = center.x + Math.sin(a) * radius;
    const y = center.y + Math.cos(a) * radius;
    points.push({ lat: start.lat + y / mLat, lng: start.lng + x / mLng });
  }
  return points;
}

/** Small seeded random number generator (mulberry32). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fine-tune an existing loop after the Routes API measured it: try dropping one stop, adding one,
 * or swapping one, and keep the change that brings the length closest to the target. `detour` is
 * the winding factor measured for this loop, so the estimates match reality closely.
 */
export function adjustLoop(opts: {
  start: LatLng;
  stops: Candidate[];
  candidates: Candidate[];
  targetMeters: number;
  detour: number;
  requiredId?: string;
}): Candidate[] {
  const { start, stops, candidates, targetMeters, detour, requiredId } = opts;
  const estimate = (list: Candidate[]) => loopStraightMeters(start, list) * detour;
  const value = (list: Candidate[]) => {
    const error = Math.abs(estimate(list) - targetMeters) / targetMeters;
    const quality = list.reduce((s, c) => s + c.score, 0) / Math.max(1, list.length);
    return error * 4 - quality * 0.15;
  };

  let best = stops;
  let bestValue = value(stops);
  const consider = (list: Candidate[]) => {
    const v = value(list);
    if (v < bestValue) {
      best = list;
      bestValue = v;
    }
  };

  const used = new Set(stops.map((s) => s.id));
  // Only stops reasonably near the current loop are worth trying.
  const reach = targetMeters / (2 * detour);
  const extras = candidates
    .filter((c) => !used.has(c.id) && distanceMeters(start, c.location) < reach * 1.2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 60);

  const optional = stops.filter((s) => s.id !== requiredId);
  // Drop one stop.
  if (stops.length > 1) for (const s of optional) consider(stops.filter((x) => x.id !== s.id));
  // Add one stop (if room).
  if (stops.length < MAX_SIGHT_STOPS + 1) for (const c of extras) consider(insertCheapest(start, stops, c));
  // Swap one stop for another.
  for (const s of optional)
    for (const c of extras) {
      const without = stops.filter((x) => x.id !== s.id);
      consider(insertCheapest(start, without, c));
    }
  return best;
}
