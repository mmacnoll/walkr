// Simulates Google failures to check the user sees a friendly message for each.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultEntrance, getPark } from "@/data/parks";
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
