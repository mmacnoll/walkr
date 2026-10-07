import { describe, expect, it } from "vitest";
import type { WalkStop } from "@/lib/walk";
import { stopBadges } from "./ResultsPanel";

const stop = (kind: WalkStop["kind"]): WalkStop => ({ id: kind + Math.random(), name: kind, kind, location: { lat: 0, lng: 0 } });

describe("stopBadges", () => {
  it("numbers sights 1, 2, 3 and gives food stops an icon without using up a number", () => {
    expect(stopBadges([stop("coffee"), stop("sight"), stop("sight")])).toEqual(["☕", "1", "2"]);
    expect(stopBadges([stop("sight"), stop("lunch"), stop("landmark"), stop("sight")])).toEqual(["1", "🥪", "2", "3"]);
  });
});
