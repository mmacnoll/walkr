import { describe, expect, it } from "vitest";
import {
  describeLength,
  formatDuration,
  formatMiles,
  googleMapsDirectionsUrl,
  milesToMinutes,
  minutesToMeters,
  minutesToMiles,
  snapToSlider,
} from "./walk";

describe("walk length conversions (3 mph)", () => {
  it("converts minutes to miles and back", () => {
    expect(minutesToMiles(30)).toBe(1.5);
    expect(milesToMinutes(2)).toBe(40);
  });

  it("converts minutes to meters", () => {
    expect(minutesToMeters(20)).toBe(1609);
    expect(minutesToMeters(45)).toBe(3621);
  });

  it("describes a length in both units", () => {
    expect(describeLength(30)).toBe("30 min · 1.5 mi");
    expect(describeLength(45)).toBe("45 min · 2.25 mi");
  });
});

describe("snapToSlider", () => {
  it("snaps to the step", () => {
    expect(snapToSlider(32, "min")).toBe(30);
    expect(snapToSlider(1.6, "mi")).toBe(1.5);
    expect(snapToSlider(1.7, "mi")).toBe(1.75);
  });

  it("clamps to the limits", () => {
    expect(snapToSlider(5, "min")).toBe(10);
    expect(snapToSlider(200, "min")).toBe(90);
    expect(snapToSlider(0.1, "mi")).toBe(0.5);
    expect(snapToSlider(9, "mi")).toBe(4.5);
  });
});

describe("formatting", () => {
  it("formats miles", () => {
    expect(formatMiles(3862)).toBe("2.4 mi");
  });
  it("formats durations", () => {
    expect(formatDuration(3060)).toBe("51 min");
    expect(formatDuration(3900)).toBe("1 hr 5 min");
    expect(formatDuration(7200)).toBe("2 hr");
    expect(formatDuration(10)).toBe("1 min");
  });
});

describe("googleMapsDirectionsUrl", () => {
  const start = { lat: 40.768, lng: -73.981 };
  it("makes a walking loop link back to the start", () => {
    const url = new URL(googleMapsDirectionsUrl(start, [{ location: { lat: 40.774, lng: -73.97 } }]));
    expect(url.searchParams.get("origin")).toBe("40.768000,-73.981000");
    expect(url.searchParams.get("destination")).toBe("40.768000,-73.981000");
    expect(url.searchParams.get("travelmode")).toBe("walking");
    expect(url.searchParams.get("waypoints")).toBe("40.774000,-73.970000");
  });
  it("keeps at most 9 waypoints", () => {
    const stops = Array.from({ length: 12 }, (_, i) => ({ location: { lat: 40.77 + i * 0.001, lng: -73.97 } }));
    const url = new URL(googleMapsDirectionsUrl(start, stops));
    expect(url.searchParams.get("waypoints")!.split("|")).toHaveLength(9);
  });
});
