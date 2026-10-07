import { describe, expect, it } from "vitest";
import { clampHeight, settle, snapHeights, toggle } from "./sheet";

const h = snapHeights(800, 64); // a typical phone: 800 px tall, 64 px title bar

describe("snapHeights", () => {
  it("peek = title bar, half = 50%, full = 85% of the screen", () => {
    expect(h).toEqual({ peek: 64, half: 400, full: 680 });
  });
  it("never puts half below peek on a tiny screen", () => {
    const tiny = snapHeights(100, 64);
    expect(tiny.half).toBeGreaterThanOrEqual(tiny.peek);
    expect(tiny.full).toBeGreaterThanOrEqual(tiny.half);
  });
});

describe("clampHeight", () => {
  it("stops at the top and bottom", () => {
    expect(clampHeight(10, h)).toBe(64);
    expect(clampHeight(2000, h)).toBe(680);
    expect(clampHeight(300, h)).toBe(300);
  });
});

describe("settle", () => {
  it("slow drags go to the nearest height", () => {
    expect(settle(120, 0, "half", h)).toBe("peek");
    expect(settle(450, 0.1, "peek", h)).toBe("half");
    expect(settle(600, -0.1, "half", h)).toBe("full");
  });
  it("a flick moves one step from where the drag started", () => {
    expect(settle(420, 1, "half", h)).toBe("full");
    expect(settle(380, -1, "half", h)).toBe("peek");
    expect(settle(100, 1, "peek", h)).toBe("half");
  });
  it("a flick past the end stays at the end", () => {
    expect(settle(680, 2, "full", h)).toBe("full");
    expect(settle(64, -2, "peek", h)).toBe("peek");
  });
});

describe("toggle", () => {
  it("opens to half and closes to peek", () => {
    expect(toggle("peek")).toBe("half");
    expect(toggle("half")).toBe("peek");
    expect(toggle("full")).toBe("peek");
  });
});
