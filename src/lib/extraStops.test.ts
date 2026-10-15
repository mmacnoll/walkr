import { describe, expect, it } from "vitest";
import { getAmenities } from "@/data/amenities";
import { getPark } from "@/data/parks";
import { addExtraStops, availableExtras, fountainsMayBeOff } from "./extraStops";
import { loopStraightMeters } from "./loop";

const riverside = getPark("riverside-park")!;
const start = riverside.entrances.find((e) => e.isDefault)!.location;

describe("addExtraStops", () => {
  it("adds one stop per kind, choosing the place that adds the least walking", () => {
    const { stops, missing } = addExtraStops(riverside.id, start, [], ["restroom"]);
    expect(missing).toEqual([]);
    expect(stops).toHaveLength(1);
    const chosen = loopStraightMeters(start, stops);
    for (const a of getAmenities(riverside.id, "restroom")) expect(chosen).toBeLessThanOrEqual(loopStraightMeters(start, [a]) + 0.01);
  });

  it("keeps the existing stops in order and fits extras in between", () => {
    const sights = [{ id: "a", location: { lat: start.lat + 0.01, lng: start.lng } }, { id: "b", location: { lat: start.lat + 0.02, lng: start.lng } }];
    const { stops } = addExtraStops(riverside.id, start, sights, ["water", "playground"]);
    expect(stops).toHaveLength(4);
    expect(stops.filter((s) => "id" in s && (s.id === "a" || s.id === "b")).map((s) => s.id)).toEqual(["a", "b"]);
  });

  it("reports kinds with no place near the park", () => {
    // Central Park has no fenced dog runs.
    const { stops, missing } = addExtraStops("central-park", start, [], ["dogrun", "restroom"]);
    expect(missing).toEqual(["dogrun"]);
    expect(stops).toHaveLength(1);
  });
});

describe("amenity data", () => {
  it("covers every park with restrooms and water", () => {
    for (const id of ["central-park", "riverside-park", "prospect-park", "the-battery", "brooklyn-bridge-park"]) {
      expect(availableExtras(id).has("restroom")).toBe(true);
      expect(availableExtras(id).has("water")).toBe(true);
    }
  });
});

describe("fountainsMayBeOff", () => {
  it("is true in winter and false in summer (New York time)", () => {
    expect(fountainsMayBeOff(new Date("2026-01-15T12:00:00Z"))).toBe(true);
    expect(fountainsMayBeOff(new Date("2026-07-15T12:00:00Z"))).toBe(false);
  });
});
