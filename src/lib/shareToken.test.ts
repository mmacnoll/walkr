import { beforeEach, describe, expect, it } from "vitest";
import { makeShareToken, readShareToken, type SharedWalk } from "./shareToken";

const walk: SharedWalk = {
  parkId: "central-park",
  entranceId: "columbus-circle",
  stops: [
    { kind: "sight", id: "ChIJabc", lat: 40.7712345, lng: -73.9745678 },
    { kind: "coffee", id: "ChIJcafe", lat: 40.772, lng: -73.97 },
    { kind: "restroom", lat: 40.773, lng: -73.971 },
  ],
};

beforeEach(() => {
  process.env.GOOGLE_MAPS_SERVER_KEY = "test-key";
});

describe("share tokens", () => {
  it("round-trips a walk (positions rounded to ~1 m)", () => {
    const back = readShareToken(makeShareToken(walk))!;
    expect(back.parkId).toBe("central-park");
    expect(back.entranceId).toBe("columbus-circle");
    expect(back.stops.map((s) => [s.kind, s.id])).toEqual([["sight", "ChIJabc"], ["coffee", "ChIJcafe"], ["restroom", undefined]]);
    expect(back.stops[0].lat).toBeCloseTo(40.77123, 5);
  });

  it("is URL-safe and reasonably short", () => {
    const token = makeShareToken(walk);
    expect(token).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    expect(token.length).toBeLessThan(400);
  });

  it("rejects a tampered walk", () => {
    const [, signature] = makeShareToken(walk).split(".");
    const other = makeShareToken({ ...walk, parkId: "prospect-park" }).split(".")[0];
    expect(readShareToken(`${other}.${signature}`)).toBeNull();
  });

  it("rejects a token signed with another key, and junk", () => {
    const token = makeShareToken(walk);
    process.env.GOOGLE_MAPS_SERVER_KEY = "other-key";
    expect(readShareToken(token)).toBeNull();
    expect(readShareToken("")).toBeNull();
    expect(readShareToken("abc")).toBeNull();
    expect(readShareToken("a.b.c")).toBeNull();
  });

  it("rejects walks with no stops or too many", () => {
    expect(readShareToken(makeShareToken({ ...walk, stops: [] }))).toBeNull();
    expect(readShareToken(makeShareToken({ ...walk, stops: Array(11).fill(walk.stops[0]) }))).toBeNull();
  });
});
