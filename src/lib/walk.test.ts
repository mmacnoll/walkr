import { describe, expect, it } from "vitest";
import { describeLength, milesToMinutes, minutesToMeters, minutesToMiles, snapToSlider } from "./walk";

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
