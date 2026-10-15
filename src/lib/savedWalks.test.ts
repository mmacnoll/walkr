import { describe, expect, it } from "vitest";
import { isSaved, listSaved, MAX_SAVED, removeSaved, saveWalk, type Storage } from "./savedWalks";
import type { WalkResult } from "./walk";

function fakeStorage(): Storage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const walk = (share: string): WalkResult => ({
  parkId: "brooklyn-bridge-park",
  start: { name: "Pier 1", location: { lat: 40.7, lng: -73.99 } },
  stops: [
    { id: "a", name: "Pier 4 Beach", kind: "sight", location: { lat: 40.69, lng: -73.99 } },
    { id: "b", name: "OddFellows", kind: "treat", location: { lat: 40.69, lng: -74 } },
    { id: "c", name: "Restroom", kind: "restroom", location: { lat: 40.7, lng: -73.99 } },
  ],
  encodedPolyline: "abc",
  distanceMeters: 3057,
  durationSeconds: 2520,
  targetMeters: 3000,
  withinTarget: true,
  share,
});

describe("saved walks", () => {
  it("saves a summary we wrote ourselves (no Google place names)", () => {
    const store = fakeStorage();
    expect(saveWalk(walk("t1"), "Brooklyn Bridge Park", store, new Date("2026-10-16T12:00:00Z"))).toBe(true);
    const [saved] = listSaved(store);
    expect(saved).toEqual({
      token: "t1",
      parkId: "brooklyn-bridge-park",
      parkName: "Brooklyn Bridge Park",
      summary: "1.9 mi · 42 min · 3 stops",
      icons: "🍰🚻",
      savedAt: "2026-10-16T12:00:00.000Z",
    });
    expect(store.data.get("walkr:saved-walks")).not.toContain("OddFellows");
  });

  it("keeps newest first, doesn't duplicate, and can remove", () => {
    const store = fakeStorage();
    saveWalk(walk("t1"), "A", store);
    saveWalk(walk("t2"), "B", store);
    saveWalk(walk("t1"), "A", store);
    expect(listSaved(store).map((w) => w.token)).toEqual(["t1", "t2"]);
    expect(isSaved("t2", store)).toBe(true);
    removeSaved("t2", store);
    expect(isSaved("t2", store)).toBe(false);
  });

  it(`keeps at most ${MAX_SAVED}`, () => {
    const store = fakeStorage();
    for (let i = 0; i < MAX_SAVED + 5; i++) saveWalk(walk(`t${i}`), "P", store);
    expect(listSaved(store)).toHaveLength(MAX_SAVED);
    expect(listSaved(store)[0].token).toBe(`t${MAX_SAVED + 4}`);
  });

  it("copes with no storage, broken data, and walks that can't be shared", () => {
    expect(listSaved(null)).toEqual([]);
    expect(saveWalk(walk("t1"), "P", null)).toBe(false);
    const store = fakeStorage();
    store.setItem("walkr:saved-walks", "{not json");
    expect(listSaved(store)).toEqual([]);
    expect(saveWalk({ ...walk("x"), share: undefined }, "P", store)).toBe(false);
  });
});
