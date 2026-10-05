import { describe, expect, it } from "vitest";
import { distanceMeters } from "./geo";
import {
  type Candidate,
  DEFAULT_DETOUR,
  fallbackCircle,
  insertCheapest,
  loopStraightMeters,
  MAX_SIGHT_STOPS,
  planLoop,
  seededRandom,
  targetStopCount,
} from "./loop";
import type { LatLng } from "./types";

// A fake "park": a grid of candidate stops north of the start, every ~150 m.
const start: LatLng = { lat: 40.77, lng: -73.97 };
const mLat = 1 / 111_320;
const mLng = mLat / Math.cos((start.lat * Math.PI) / 180);
function grid(): Candidate[] {
  const out: Candidate[] = [];
  for (let i = 0; i < 20; i++)
    for (let j = -4; j <= 4; j++)
      out.push({
        id: `s${i}_${j}`,
        location: { lat: start.lat + (i + 1) * 150 * mLat, lng: start.lng + j * 150 * mLng },
        score: (i * 7 + j * 3) % 5 === 0 ? 1.2 : 0.6,
        kind: "sight",
      });
  return out;
}

describe("planLoop", () => {
  it.each([1609, 2414, 3621, 4828])("plans a loop close to %i m (estimated)", (target) => {
    const plan = planLoop({ start, targetMeters: target, candidates: grid(), detour: DEFAULT_DETOUR, rng: seededRandom(1) });
    expect(plan).not.toBeNull();
    expect(plan!.estimatedMeters).toBeGreaterThan(target * 0.85);
    expect(plan!.estimatedMeters).toBeLessThan(target * 1.15);
    expect(plan!.stops.length).toBeGreaterThanOrEqual(1);
    expect(plan!.stops.length).toBeLessThanOrEqual(MAX_SIGHT_STOPS);
  });

  it("estimates with the detour factor", () => {
    const plan = planLoop({ start, targetMeters: 3000, candidates: grid(), detour: 1.5, rng: seededRandom(2) })!;
    expect(plan.estimatedMeters).toBeCloseTo(loopStraightMeters(start, plan.stops) * 1.5, 5);
  });

  it("always includes the required café", () => {
    const cafe: Candidate = { id: "cafe", location: { lat: start.lat + 900 * mLat, lng: start.lng + 300 * mLng }, score: 1, kind: "coffee" };
    const plan = planLoop({ start, targetMeters: 3000, candidates: grid(), detour: DEFAULT_DETOUR, rng: seededRandom(3), required: cafe })!;
    expect(plan.stops.some((s) => s.id === "cafe")).toBe(true);
  });

  it("gives a different loop when asked to avoid the previous one (Try another)", () => {
    const a = planLoop({ start, targetMeters: 3000, candidates: grid(), detour: DEFAULT_DETOUR, rng: seededRandom(10) })!;
    const b = planLoop({ start, targetMeters: 3000, candidates: grid(), detour: DEFAULT_DETOUR, rng: seededRandom(11), avoid: new Set(a.stops.map((s) => s.id)) })!;
    const shared = b.stops.filter((s) => a.stops.some((x) => x.id === s.id)).length;
    expect(shared).toBeLessThan(a.stops.length / 2);
  });

  it("returns null without candidates", () => {
    expect(planLoop({ start, targetMeters: 3000, candidates: [], detour: DEFAULT_DETOUR, rng: seededRandom(1) })).toBeNull();
  });

  it("spreads stops into a loop (not all on one line)", () => {
    const plan = planLoop({ start, targetMeters: 4000, candidates: grid(), detour: DEFAULT_DETOUR, rng: seededRandom(4) })!;
    const lngs = plan.stops.map((s) => s.location.lng);
    expect(Math.max(...lngs) - Math.min(...lngs)).toBeGreaterThan(100 * mLng);
  });
});

describe("helpers", () => {
  it("targets about one stop per 700 m", () => {
    expect(targetStopCount(1000)).toBe(2);
    expect(targetStopCount(3500)).toBe(6);
    expect(targetStopCount(9000)).toBe(MAX_SIGHT_STOPS);
  });

  it("inserts a stop where it adds the least distance", () => {
    const a: Candidate = { id: "a", location: { lat: start.lat + 1000 * mLat, lng: start.lng }, score: 1, kind: "sight" };
    const b: Candidate = { id: "b", location: { lat: start.lat + 1000 * mLat, lng: start.lng + 1000 * mLng }, score: 1, kind: "sight" };
    const mid: Candidate = { id: "m", location: { lat: start.lat + 1000 * mLat, lng: start.lng + 500 * mLng }, score: 1, kind: "coffee" };
    expect(insertCheapest(start, [a, b], mid).map((s) => s.id)).toEqual(["a", "m", "b"]);
  });

  it("makes a fallback circle of the right size", () => {
    const towards = { lat: start.lat + 0.01, lng: start.lng };
    const pts = fallbackCircle(start, towards, 3000, DEFAULT_DETOUR);
    expect(pts).toHaveLength(5);
    const straight = loopStraightMeters(start, pts.map((location) => ({ location })));
    expect(straight * DEFAULT_DETOUR).toBeGreaterThan(3000 * 0.85);
    expect(straight * DEFAULT_DETOUR).toBeLessThan(3000 * 1.05);
    // Heads toward the park: the farthest point is north of the start.
    const far = pts.reduce((f, p) => (distanceMeters(start, p) > distanceMeters(start, f) ? p : f));
    expect(far.lat).toBeGreaterThan(start.lat);
  });
});
