import { describe, expect, it } from "vitest";
import { estimateCustomWalk, FOOD_DETOUR_ESTIMATE_M, maxPicks, orderLoop } from "./customWalk";
import { loopStraightMeters } from "./loop";
import type { LatLng } from "./types";

const start: LatLng = { lat: 40.7681, lng: -73.9819 }; // Columbus Circle
const at = (dLat: number, dLng: number, id: string) => ({ id, location: { lat: start.lat + dLat, lng: start.lng + dLng } });

// Every order, for checking the result really is the shortest.
function shortestByHand(stops: ReturnType<typeof at>[]): number {
  const perms = (xs: typeof stops): (typeof stops)[] =>
    xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
  return Math.min(...perms(stops).map((p) => loopStraightMeters(start, p)));
}

describe("orderLoop", () => {
  it("keeps 0–2 stops as they are (any order of 2 is the same loop)", () => {
    expect(orderLoop(start, [])).toEqual([]);
    const two = [at(0.01, 0, "a"), at(0, 0.01, "b")];
    expect(orderLoop(start, two).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("untangles a zig-zag into a clean loop", () => {
    // Corners of a square, picked in a crossing order.
    const picks = [at(0.004, 0, "N"), at(0, 0.004, "E"), at(0.004, 0.004, "NE")];
    const ordered = orderLoop(start, picks).map((s) => s.id);
    expect([["N", "NE", "E"], ["E", "NE", "N"]]).toContainEqual(ordered);
  });

  it("finds the shortest loop for up to 8 stops", () => {
    const picks = [at(0.01, 0.002, "a"), at(0.003, 0.009, "b"), at(0.012, 0.011, "c"), at(0.006, 0.001, "d"), at(0.002, 0.004, "e"), at(0.009, 0.007, "f")];
    expect(loopStraightMeters(start, orderLoop(start, picks))).toBeCloseTo(shortestByHand(picks), 3);
  });

  it("gives a short, uncrossed loop for 10 stops", () => {
    const ring = Array.from({ length: 10 }, (_, i) => {
      const a = (i / 10) * 2 * Math.PI;
      return at(0.01 + 0.008 * Math.sin(a), 0.008 * Math.cos(a), `p${i}`);
    });
    const scrambled = [3, 7, 1, 9, 0, 5, 2, 8, 4, 6].map((i) => ring[i]);
    const ordered = orderLoop(start, scrambled);
    expect(new Set(ordered.map((s) => s.id)).size).toBe(10);
    // Going round the ring in order is optimal here; 2-opt should land within 2% of it.
    const inOrder = Math.min(loopStraightMeters(start, ring), loopStraightMeters(start, [...ring.slice(5), ...ring.slice(0, 5)]));
    expect(loopStraightMeters(start, ordered)).toBeLessThanOrEqual(inOrder * 1.02);
  });
});

describe("estimateCustomWalk", () => {
  it("is zero with no picks", () => {
    expect(estimateCustomWalk(start, [], true)).toEqual({ meters: 0, minutes: 0 });
  });

  it("uses straight-line length × winding, at Google's 22.4 min per mile", () => {
    const picks = [at(0.009, 0, "a")]; // ~1 km north and back = ~2 km straight
    const straight = loopStraightMeters(start, picks);
    const e = estimateCustomWalk(start, picks, false, 1.3);
    expect(e.meters).toBeCloseTo(straight * 1.3, 5);
    expect(e.minutes).toBeCloseTo((e.meters / 1609.344) * 22.4, 5);
  });

  it("adds a little for a food detour", () => {
    const picks = [at(0.009, 0, "a")];
    expect(estimateCustomWalk(start, picks, true).meters - estimateCustomWalk(start, picks, false).meters).toBeCloseTo(FOOD_DETOUR_ESTIMATE_M);
  });
});

describe("maxPicks", () => {
  it("leaves room for a food stop within Google's 10-stop tier", () => {
    expect(maxPicks(false)).toBe(10);
    expect(maxPicks(true)).toBe(9);
  });
});
