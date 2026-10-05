import { describe, expect, it } from "vitest";
import { fetchWalk, MESSAGES, WalkError } from "./fetchWalk";

const request = { parkId: "central-park", entranceId: "x", mood: "scenic" as const, distanceMeters: 2400 };
const json = (status: number, body: unknown) => async () => new Response(JSON.stringify(body), { status });

async function errorOf(p: Promise<unknown>): Promise<WalkError> {
  try {
    await p;
  } catch (e) {
    return e as WalkError;
  }
  throw new Error("expected an error");
}

describe("fetchWalk", () => {
  it("returns the walk on success", async () => {
    const walk = await fetchWalk(request, { fetchImpl: json(200, { distanceMeters: 2400 }) as typeof fetch });
    expect(walk.distanceMeters).toBe(2400);
  });

  it("says you're offline without even trying", async () => {
    const e = await errorOf(fetchWalk(request, { isOnline: () => false }));
    expect(e.message).toBe(MESSAGES.offline);
    expect(e.retryable).toBe(true);
  });

  it("times out", async () => {
    const hang = ((_: unknown, init: RequestInit) =>
      new Promise((_r, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as typeof fetch;
    const e = await errorOf(fetchWalk(request, { fetchImpl: hang, timeoutMs: 20 }));
    expect(e.message).toBe(MESSAGES.timeout);
  });

  it("handles a network failure", async () => {
    const fail = (async () => {
      throw new TypeError("Failed to fetch");
    }) as typeof fetch;
    const e = await errorOf(fetchWalk(request, { fetchImpl: fail }));
    expect(e.message).toBe(MESSAGES.generic);
  });

  it("shows the server's friendly message; bad input isn't retryable", async () => {
    const e = await errorOf(fetchWalk(request, { fetchImpl: json(400, { error: "Unknown park." }) as typeof fetch }));
    expect(e.message).toBe("Unknown park.");
    expect(e.retryable).toBe(false);
  });

  it("server problems are retryable", async () => {
    const e = await errorOf(fetchWalk(request, { fetchImpl: json(503, { error: "Daily limit" }) as typeof fetch }));
    expect(e.retryable).toBe(true);
  });

  it("copes with a non-JSON response", async () => {
    const html = (async () => new Response("<html>oops</html>", { status: 500 })) as typeof fetch;
    const e = await errorOf(fetchWalk(request, { fetchImpl: html }));
    expect(e.message).toBe(MESSAGES.generic);
  });
});
