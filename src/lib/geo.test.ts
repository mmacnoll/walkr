import { describe, expect, it } from "vitest";
import {
  bearingDegrees,
  boundsOf,
  distanceMeters,
  distanceToPolygonEdgeMeters,
  isInsidePolygon,
  isWithinPolygonBuffer,
} from "./geo";

const columbusCircle = { lat: 40.7681, lng: -73.9819 };
const grandArmyPlaza = { lat: 40.7644, lng: -73.973 };

// A ~111m x ~84m box near Central Park.
const square = [
  { lat: 40.78, lng: -73.97 },
  { lat: 40.78, lng: -73.969 },
  { lat: 40.781, lng: -73.969 },
  { lat: 40.781, lng: -73.97 },
];

describe("distanceMeters", () => {
  it("measures Columbus Circle to Grand Army Plaza (~840m)", () => {
    expect(distanceMeters(columbusCircle, grandArmyPlaza)).toBeGreaterThan(800);
    expect(distanceMeters(columbusCircle, grandArmyPlaza)).toBeLessThan(880);
  });

  it("is zero for the same point", () => {
    expect(distanceMeters(columbusCircle, columbusCircle)).toBe(0);
  });
});

describe("bearingDegrees", () => {
  const origin = { lat: 40.78, lng: -73.97 };
  it.each([
    ["north", { lat: 40.79, lng: -73.97 }, 0],
    ["east", { lat: 40.78, lng: -73.96 }, 90],
    ["south", { lat: 40.77, lng: -73.97 }, 180],
    ["west", { lat: 40.78, lng: -73.98 }, 270],
  ])("points %s", (_, target, expected) => {
    expect(bearingDegrees(origin, target)).toBeCloseTo(expected, 0);
  });
});

describe("isInsidePolygon", () => {
  it("detects a point inside", () => {
    expect(isInsidePolygon({ lat: 40.7805, lng: -73.9695 }, square)).toBe(true);
  });
  it("detects a point outside", () => {
    expect(isInsidePolygon({ lat: 40.7815, lng: -73.9695 }, square)).toBe(false);
  });
});

describe("distanceToPolygonEdgeMeters", () => {
  it("measures distance from an outside point to the nearest edge", () => {
    // 0.0005° of latitude north of the top edge ≈ 55.7m
    const d = distanceToPolygonEdgeMeters({ lat: 40.7815, lng: -73.9695 }, square);
    expect(d).toBeCloseTo(55.7, 0);
  });
  it("measures distance from an inside point to the nearest edge", () => {
    const d = distanceToPolygonEdgeMeters({ lat: 40.7809, lng: -73.9695 }, square);
    expect(d).toBeCloseTo(11.1, 0);
  });
});

describe("isWithinPolygonBuffer", () => {
  it("accepts points just outside when within the buffer", () => {
    expect(isWithinPolygonBuffer({ lat: 40.7815, lng: -73.9695 }, square, 60)).toBe(true);
    expect(isWithinPolygonBuffer({ lat: 40.7815, lng: -73.9695 }, square, 50)).toBe(false);
  });
});

describe("boundsOf", () => {
  it("returns the bounding box", () => {
    expect(boundsOf(square)).toEqual({ north: 40.781, south: 40.78, east: -73.969, west: -73.97 });
  });
});
