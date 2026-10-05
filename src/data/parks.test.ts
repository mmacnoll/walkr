// Sanity checks for the hand-entered park data. These catch typos in coordinates,
// e.g. an entrance accidentally placed a mile away from its park.
import { describe, expect, it } from "vitest";
import { distanceToPolygonEdgeMeters, isWithinPolygonBuffer } from "@/lib/geo";
import { parks } from "./parks";

const TWO_BLOCKS_M = 250;
const WALK_ZONE_M = 1600; // ~1 mile around small and linear parks

describe("parks data", () => {
  it("has the 12 expected parks with unique ids", () => {
    expect(parks).toHaveLength(12);
    expect(new Set(parks.map((p) => p.id)).size).toBe(12);
  });

  describe.each(parks.map((p) => [p.name, p] as const))("%s", (_, park) => {
    it("has a valid outline", () => {
      expect(park.boundary.length).toBeGreaterThanOrEqual(3);
    });

    it("has exactly one default entrance and unique entrance ids", () => {
      expect(park.entrances.filter((e) => e.isDefault)).toHaveLength(1);
      expect(new Set(park.entrances.map((e) => e.id)).size).toBe(park.entrances.length);
    });

    it("has its center inside or right next to the outline", () => {
      expect(isWithinPolygonBuffer(park.center, park.boundary, 100)).toBe(true);
    });

    it.each(park.entrances.map((e) => [e.name, e] as const))("entrance %s is on the park edge", (_, e) => {
      expect(isWithinPolygonBuffer(e.location, park.boundary, 120)).toBe(true);
    });

    it("has unique landmark ids and at least one scenic and one quiet landmark", () => {
      expect(new Set(park.landmarks.map((l) => l.id)).size).toBe(park.landmarks.length);
      expect(park.landmarks.some((l) => l.moods.includes("scenic"))).toBe(true);
      expect(park.landmarks.some((l) => l.moods.includes("quiet"))).toBe(true);
    });

    it.each(park.landmarks.map((l) => [l.name, l] as const))("landmark %s is in range", (_, l) => {
      if (park.kind === "large") {
        const isFoodStop = l.moods.includes("coffee") || l.moods.includes("lunch");
        const allowed = isFoodStop ? TWO_BLOCKS_M : 150;
        expect(isWithinPolygonBuffer(l.location, park.boundary, allowed)).toBe(true);
      } else {
        expect(distanceToPolygonEdgeMeters(l.location, park.boundary)).toBeLessThanOrEqual(WALK_ZONE_M);
      }
    });

    it("has a centerline only if it is a linear park", () => {
      expect(Boolean(park.path)).toBe(park.kind === "linear");
    });
  });
});
