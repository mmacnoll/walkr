import { encode } from "@googlemaps/polyline-codec";
import { describe, expect, it } from "vitest";
import pathInfo from "@/data/pathinfo.json";
import { hasWaterfront, measureRoute, preferenceBonus, preferenceScore } from "./pathPrefs";

type Line = [number, number][];
const parks = (pathInfo as unknown as { parks: Record<string, { lit: Line[]; water: Line[] }> }).parks;

/** A route that runs exactly along the given line. */
const along = (line: Line) => encode(line, 5);

describe("measureRoute", () => {
  it("counts a route along a lit path as lit", () => {
    const longest = [...parks["central-park"].lit].sort((a, b) => b.length - a.length)[0];
    const stats = measureRoute("central-park", along(longest))!;
    expect(stats.litPct).toBeGreaterThanOrEqual(90);
  });

  it("counts a route along the shoreline as waterfront", () => {
    const shore = [...parks["riverside-park"].water].sort((a, b) => b.length - a.length)[0];
    const stats = measureRoute("riverside-park", along(shore))!;
    expect(stats.waterPct).toBeGreaterThanOrEqual(90);
  });

  it("returns null for an unknown park", () => {
    expect(measureRoute("nowhere", along([[40.7, -73.9], [40.71, -73.9]]))).toBeNull();
  });
});

describe("preferences", () => {
  it("knows which parks have a waterfront", () => {
    expect(hasWaterfront("riverside-park")).toBe(true);
    expect(hasWaterfront("brooklyn-bridge-park")).toBe(true);
    expect(hasWaterfront("union-square-park")).toBe(false);
    expect(hasWaterfront("madison-square-park")).toBe(false);
  });

  it("gives sights on lit paths a bonus only when 'well lit' is on", () => {
    const [lat, lng] = parks["central-park"].lit[0][0];
    expect(preferenceBonus("central-park", { lat, lng }, ["lit"])).toBeGreaterThan(0);
    expect(preferenceBonus("central-park", { lat, lng }, [])).toBe(0);
  });

  it("scores routes by the chosen preferences (unlit stretches count against)", () => {
    const stats = { litPct: 70, unlitPct: 10, waterPct: 40 };
    expect(preferenceScore(stats, ["lit"])).toBe(50);
    expect(preferenceScore(stats, ["water"])).toBe(40);
    expect(preferenceScore(stats, ["lit", "water"])).toBe(90);
    expect(preferenceScore(null, ["lit"])).toBe(0);
  });
});
