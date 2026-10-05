import { describe, expect, it } from "vitest";
import { scoreFood, scoreLandmark, scoreSight } from "./scoring";

describe("scoreSight", () => {
  it("prefers sights matching the mood", () => {
    expect(scoreSight({ moods: ["scenic"], inPark: true }, "scenic")).toBeGreaterThan(scoreSight({ moods: ["quiet"], inPark: true }, "scenic"));
    expect(scoreSight({ moods: ["quiet"], inPark: true }, "quiet")).toBeGreaterThan(scoreSight({ moods: ["scenic"], inPark: true }, "quiet"));
  });

  it("gives a bonus for being inside the park", () => {
    expect(scoreSight({ moods: ["scenic"], inPark: true }, "scenic")).toBeGreaterThan(scoreSight({ moods: ["scenic"], inPark: false }, "scenic"));
  });

  it("values any sight on coffee and lunch walks", () => {
    expect(scoreSight({ moods: ["quiet"], inPark: true }, "coffee")).toBeGreaterThan(0.8);
  });
});

describe("scoreLandmark", () => {
  it("prefers landmarks tagged with the mood", () => {
    expect(scoreLandmark({ moods: ["quiet"] }, "quiet")).toBeGreaterThan(scoreLandmark({ moods: ["scenic"] }, "quiet"));
  });
});

describe("scoreFood", () => {
  it("skips places that are closed, poorly rated or barely reviewed", () => {
    expect(scoreFood({ rating: 4.6, ratingCount: 500, openNow: false }, 0)).toBe(-Infinity);
    expect(scoreFood({ rating: 3.8, ratingCount: 500, openNow: true }, 0)).toBe(-Infinity);
    expect(scoreFood({ rating: 4.8, ratingCount: 5, openNow: true }, 0)).toBe(-Infinity);
  });

  it("prefers better-rated and closer places", () => {
    expect(scoreFood({ rating: 4.7, ratingCount: 800 }, 100)).toBeGreaterThan(scoreFood({ rating: 4.2, ratingCount: 800 }, 100));
    expect(scoreFood({ rating: 4.5, ratingCount: 800 }, 100)).toBeGreaterThan(scoreFood({ rating: 4.5, ratingCount: 800 }, 900));
  });
});
