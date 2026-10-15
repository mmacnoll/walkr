// Simulates Google failures to check the user sees a friendly message for each.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultEntrance, getPark } from "@/data/parks";
import { getSights } from "@/data/sights";
import { POST } from "./route";

const park = getPark("riverside-park")!;
const body = (extra: object = {}) => ({ parkId: park.id, entranceId: defaultEntrance(park).id, mood: "scenic", distanceMeters: 2400, includeNames: false, ...extra });
const post = (b: unknown) => POST(new Request("http://test/api/route", { method: "POST", body: typeof b === "string" ? b : JSON.stringify(b) }));
const googleSays = (status: number, message = "nope") => vi.fn(async () => new Response(JSON.stringify({ error: { message, status: "X" } }), { status }));

beforeEach(() => {
  process.env.GOOGLE_MAPS_SERVER_KEY = "test-key";
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("POST /api/route: bad input (no Google calls)", () => {
  it.each([
    ["not JSON", "{oops", /JSON/],
    ["unknown park", body({ parkId: "nope" }), /Unknown park/],
    ["unknown entrance", body({ entranceId: "nope" }), /Unknown entrance/],
    ["unknown mood", body({ mood: "spooky" }), /Unknown mood/],
    ["too short", body({ distanceMeters: 100 }), /between/],
    ["too long", body({ distanceMeters: 50_000 }), /between/],
  ])("rejects %s", async (_, b, message) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await post(b);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(message);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("POST /api/route: Google failures", () => {
  it("daily limit reached", async () => {
    vi.stubGlobal("fetch", googleSays(429));
    const res = await post(body());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/today's limit/);
  });

  it("bad or restricted server key: generic message, details only in the log", async () => {
    vi.stubGlobal("fetch", googleSays(403, "API key not valid"));
    const res = await post(body());
    expect(res.status).toBe(502);
    const { error } = await res.json();
    expect(error).toMatch(/Couldn't build a walk/);
    expect(error).not.toMatch(/key/i);
    expect(console.error).toHaveBeenCalledWith(expect.stringMatching(/server key/));
  });

  it("no walking route possible", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ routes: [] }), { status: 200 })));
    const res = await post(body());
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/different entrance/);
  });

  it("Google too slow", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new DOMException("timed out", "TimeoutError"); }));
    const res = await post(body());
    expect(res.status).toBe(504);
    expect((await res.json()).error).toMatch(/too long/);
  });
});

describe("POST /api/route: Customize mode", () => {
  const sightIds = getSights(park.id).map((s) => s.placeId);
  const custom = (extra: object) => ({ mode: "custom", parkId: park.id, entranceId: defaultEntrance(park).id, includeNames: false, ...extra });

  it.each([
    ["no picks", { placeIds: [] }, /at least one/],
    ["a sight from another park", { placeIds: [getSights("central-park")[0].placeId] }, /aren't in this park/],
    ["duplicate picks", { placeIds: [sightIds[0], sightIds[0]] }, /aren't in this park/],
    ["too many picks", { placeIds: sightIds.slice(0, 11) }, /up to 10/],
    ["10 picks plus a refreshment", { placeIds: sightIds.slice(0, 10), refreshment: "treat" }, /up to 9 sights with the stops you've added/],
    ["10 picks plus food (older request)", { placeIds: sightIds.slice(0, 10), food: "coffee" }, /up to 9 sights/],
    ["8 picks plus coffee and 2 extras", { placeIds: sightIds.slice(0, 8), refreshment: "coffee", extras: ["restroom", "water"] }, /up to 7 sights/],
    ["unknown extra stop", { placeIds: [sightIds[0]], extras: ["hot tub"] }, /Unknown extra stops/],
    ["duplicate extra stops", { placeIds: [sightIds[0]], extras: ["water", "water"] }, /Unknown extra stops/],
    ["unknown refreshment", { placeIds: [sightIds[0]], refreshment: "pizza" }, /Unknown refreshment/],
  ])("rejects %s without calling Google", async (_, extra, message) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await post(custom(extra));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(message);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("builds the picks into one loop with a single Routes call", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ routes: [{ distanceMeters: 1800, duration: "1500s", polyline: { encodedPolyline: "abc" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await post(custom({ placeIds: sightIds.slice(0, 3) }));
    expect(res.status).toBe(200);
    const walk = await res.json();
    expect(walk.custom).toBe(true);
    expect(walk.stops.map((s: { id: string }) => s.id).sort()).toEqual(sightIds.slice(0, 3).sort());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/route: mood + refreshment", () => {
  it.each([
    ["an unknown refreshment", { refreshment: "pizza" }, /Unknown refreshment/],
    ["an unknown mood", { mood: "spooky", refreshment: "coffee" }, /Unknown mood/],
  ])("rejects %s without calling Google", async (_, extra, message) => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const res = await post(body(extra));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(message);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it.each([
    ["Quiet + Coffee", { mood: "quiet", refreshment: "coffee" }, "coffee"],
    ["Scenic + Sweet treat", { mood: "scenic", refreshment: "treat" }, "treat"],
    ["an older request with mood \"lunch\"", { mood: "lunch" }, "lunch"],
  ])("searches for the right refreshment: %s", async (_, extra, kind) => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (String(url).includes("searchNearby")) {
          calls.push(JSON.parse(String(init?.body)).includedTypes.join(","));
          return new Response(JSON.stringify({ places: [] }), { status: 200 });
        }
        return new Response(JSON.stringify({ routes: [{ distanceMeters: 2400, duration: "1800s", polyline: { encodedPolyline: "abc" } }] }), { status: 200 });
      }),
    );
    const res = await post(body(extra));
    expect(res.status).toBe(200);
    expect(calls.length).toBeGreaterThan(0);
    const expected = { coffee: "coffee_shop", lunch: "sandwich_shop", treat: "ice_cream_shop" }[kind]!;
    expect(calls[0]).toContain(expected);
  });

  it("makes no food search with no refreshment", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ routes: [{ distanceMeters: 2400, duration: "1800s", polyline: { encodedPolyline: "abc" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await post(body({ mood: "quiet", refreshment: "none" }));
    expect(res.status).toBe(200);
    expect(fetchMock.mock.calls.some((call) => String((call as unknown[])[0]).includes("searchNearby"))).toBe(false);
  });
});
