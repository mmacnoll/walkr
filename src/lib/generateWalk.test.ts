import { describe, expect, it, vi } from "vitest";
import { defaultEntrance, getPark } from "@/data/parks";
import { generateWalk, type WalkDeps } from "./generateWalk";
import { loopStraightMeters } from "./loop";
import type { RouteWaypoint } from "./routes";
import type { LatLng } from "./types";

// Fake Routes API: real distance = straight-line distance × a fixed "winding" factor.
function fakeDeps(winding: number, food: Awaited<ReturnType<WalkDeps["searchFood"]>> = []): WalkDeps & { calls: number } {
  const deps = {
    calls: 0,
    computeRoute: vi.fn(async (start: LatLng, stops: RouteWaypoint[]) => {
      deps.calls++;
      // placeId waypoints: look up their coordinates from the sights file via the test helper
      const pts = stops.map((s) => ("location" in s ? s.location : locate(s.placeId)));
      const d = loopStraightMeters(start, pts.map((location) => ({ location }))) * winding;
      return { distanceMeters: Math.round(d), durationSeconds: Math.round(d / 1.34), encodedPolyline: "abc" };
    }),
    searchFood: vi.fn(async () => food),
    getPlaceSummary: vi.fn(async () => ({ name: "A sight", type: "Sculpture" })),
  };
  return deps;
}

import sightsJson from "@/data/sights.json";
const allSights = Object.values((sightsJson as { parks: Record<string, { placeId: string; location: LatLng }[]> }).parks).flat();
const foodSpots = new Map<string, LatLng>();
function locate(placeId: string): LatLng {
  const s = allSights.find((x) => x.placeId === placeId) ?? { location: foodSpots.get(placeId)! };
  return s.location;
}

const riverside = getPark("riverside-park")!;

describe("generateWalk", () => {
  it("lands within ±15% after measuring the real winding of the paths", async () => {
    const deps = fakeDeps(1.6); // paths wind more than our 1.3 starting guess
    const walk = await generateWalk({ park: riverside, entrance: defaultEntrance(riverside), mood: "scenic", targetMeters: 3000, seed: 7 }, deps);
    expect(walk.withinTarget).toBe(true);
    expect(walk.distanceMeters).toBeGreaterThan(3000 * 0.85);
    expect(walk.distanceMeters).toBeLessThan(3000 * 1.15);
    expect(deps.calls).toBeLessThanOrEqual(4);
    expect(walk.stops.length).toBeGreaterThan(0);
    expect(walk.stops[0].name).toBe("A sight");
  });

  it("includes a café on a Quiet + Coffee walk", async () => {
    const near = { lat: 40.7925, lng: -73.978 }; // inside Riverside Park
    foodSpots.set("cafe1", near);
    const deps = fakeDeps(1.3, [{ placeId: "cafe1", name: "Good Coffee", location: near, rating: 4.6, ratingCount: 300, openNow: true, type: "Coffee shop" }]);
    const walk = await generateWalk({ park: riverside, entrance: defaultEntrance(riverside), mood: "quiet", refreshment: "coffee", targetMeters: 3000, seed: 3 }, deps);
    expect(deps.searchFood).toHaveBeenCalledWith("coffee", expect.anything(), expect.any(Number));
    const cafe = walk.stops.find((s) => s.kind === "coffee");
    expect(cafe?.name).toBe("Good Coffee");
    expect(cafe?.detail).toBe("Coffee shop · 4.6★");
  });

  it("explains when no café is found", async () => {
    const deps = fakeDeps(1.3, []);
    const walk = await generateWalk({ park: riverside, entrance: defaultEntrance(riverside), mood: "scenic", refreshment: "lunch", targetMeters: 2400, seed: 3 }, deps);
    expect(walk.note).toMatch(/lunch spot/);
    expect(walk.stops.some((s) => s.kind === "lunch")).toBe(false);
  });

  it("still returns a walk if the café search fails", async () => {
    const deps = fakeDeps(1.3);
    deps.searchFood = vi.fn(async () => {
      throw new Error("quota");
    });
    const walk = await generateWalk({ park: riverside, entrance: defaultEntrance(riverside), mood: "scenic", refreshment: "coffee", targetMeters: 2400, seed: 3 }, deps);
    expect(walk.stops.length).toBeGreaterThan(0);
    expect(walk.note).toMatch(/Couldn't look up cafés right now/);
  });

  it("adds a sweet treat stop with its own badge kind", async () => {
    const near = { lat: 40.7925, lng: -73.978 };
    foodSpots.set("treat1", near);
    const deps = fakeDeps(1.3, [{ placeId: "treat1", name: "Ice Cream Spot", location: near, rating: 4.7, ratingCount: 500, openNow: true, type: "Ice cream shop" }]);
    const walk = await generateWalk({ park: riverside, entrance: defaultEntrance(riverside), mood: "scenic", refreshment: "treat", targetMeters: 3000, seed: 3 }, deps);
    expect(deps.searchFood).toHaveBeenCalledWith("treat", expect.anything(), expect.any(Number));
    expect(walk.stops.find((s) => s.kind === "treat")?.name).toBe("Ice Cream Spot");
  });

  it("makes no food search without a refreshment", async () => {
    const deps = fakeDeps(1.3);
    await generateWalk({ park: riverside, entrance: defaultEntrance(riverside), mood: "quiet", targetMeters: 2400, seed: 3 }, deps);
    expect(deps.searchFood).not.toHaveBeenCalled();
  });

  it("says so when it can't hit the length", async () => {
    const deps = fakeDeps(1.3);
    deps.computeRoute = vi.fn(async () => ({ distanceMeters: 9000, durationSeconds: 7000, encodedPolyline: "x" }));
    const walk = await generateWalk({ park: riverside, entrance: defaultEntrance(riverside), mood: "quiet", targetMeters: 3000, seed: 1 }, deps);
    expect(walk.withinTarget).toBe(false);
    expect(walk.note).toMatch(/closest we could get/);
  });
});

describe("generateWalk: extra stops", () => {
  it("adds a restroom and a playground, still lands near the length, and stays within 10 stops", async () => {
    const deps = fakeDeps(1.3);
    const walk = await generateWalk(
      { park: riverside, entrance: defaultEntrance(riverside), mood: "scenic", refreshment: "coffee", extras: ["restroom", "water", "playground", "dogrun"], targetMeters: 4800, seed: 5 },
      deps,
    );
    const kinds = walk.stops.map((s) => s.kind);
    for (const k of ["restroom", "water", "playground", "dogrun"]) expect(kinds).toContain(k);
    expect(walk.stops.length).toBeLessThanOrEqual(10);
    expect(walk.withinTarget).toBe(true);
    // Every Routes call stayed in the cheaper tier.
    for (const call of vi.mocked(deps.computeRoute).mock.calls) expect(call[1].length).toBeLessThanOrEqual(10);
    const restroom = walk.stops.find((s) => s.kind === "restroom")!;
    expect(restroom.name).toMatch(/^Restroom/);
  });

  it("explains a kind that isn't available in the park", async () => {
    const central = getPark("central-park")!;
    const walk = await generateWalk({ park: central, entrance: defaultEntrance(central), mood: "quiet", extras: ["dogrun"], targetMeters: 2400, seed: 1 }, fakeDeps(1.3));
    expect(walk.stops.some((s) => s.kind === "dogrun")).toBe(false);
    expect(walk.note).toMatch(/no dog run in or right next to Central Park/);
  });
});

describe("generateCustomWalk: extra stops", () => {
  it("adds extras to the walker's picks with one Routes call", async () => {
    const { generateCustomWalk } = await import("./generateWalk");
    const sights = (await import("@/data/sights")).getSights(riverside.id).slice(0, 3).map((s) => s.placeId);
    const deps = fakeDeps(1.3);
    const walk = await generateCustomWalk({ park: riverside, entrance: defaultEntrance(riverside), placeIds: sights, extras: ["restroom"], includeNames: false }, deps);
    expect(deps.calls).toBe(1);
    expect(walk.stops.filter((s) => s.kind === "sight")).toHaveLength(3);
    expect(walk.stops.some((s) => s.kind === "restroom")).toBe(true);
  });
});
