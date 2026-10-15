import { afterEach, describe, expect, it, vi } from "vitest";
import { computeWalkingLoop } from "./routes";

const start = { lat: 40.768, lng: -73.981 };
const ok = { routes: [{ distanceMeters: 1500, duration: "1200s", polyline: { encodedPolyline: "abc" } }] };

afterEach(() => vi.unstubAllGlobals());

describe("computeWalkingLoop", () => {
  it("retries with stored positions when Google says a place ID is no longer valid", async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = "test-key";
    const bodies: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: RequestInit) => {
        bodies.push(JSON.parse(String(init.body)));
        return bodies.length === 1
          ? new Response(JSON.stringify({ error: { message: 'Place ID "ChIJold" not found.' } }), { status: 404 })
          : new Response(JSON.stringify(ok), { status: 200 });
      }),
    );
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const route = await computeWalkingLoop(start, [{ placeId: "ChIJold", location: { lat: 40.77, lng: -73.97 } }]);
    expect(route.distanceMeters).toBe(1500);
    expect(bodies).toHaveLength(2);
    expect((bodies[1] as { intermediates: unknown[] }).intermediates[0]).toEqual({ location: { latLng: { latitude: 40.77, longitude: -73.97 } } });
  });

  it("doesn't retry other errors", async () => {
    process.env.GOOGLE_MAPS_SERVER_KEY = "test-key";
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: { message: "Quota exceeded" } }), { status: 429 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(computeWalkingLoop(start, [{ placeId: "ChIJx", location: { lat: 40.77, lng: -73.97 } }])).rejects.toThrow(/Quota/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
