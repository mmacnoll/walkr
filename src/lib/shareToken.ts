// Shareable links: a finished walk (park, entrance, stops in order) packed into a signed token, so
// opening the link rebuilds exactly the same walk. Signed so only walks our server built can be
// rebuilt (otherwise anyone could make our server route to arbitrary places on our bill).
import { createHmac, timingSafeEqual } from "node:crypto";
import type { WalkStop } from "./walk";

/** One stop: its kind, its Google place ID or landmark ID (if any), and its position (fallback). */
export type SharedStop = { kind: WalkStop["kind"]; id?: string; lat: number; lng: number };
export type SharedWalk = { parkId: string; entranceId: string; stops: SharedStop[] };

const KINDS = new Set(["sight", "landmark", "coffee", "lunch", "treat", "restroom", "water", "playground", "dogrun"]);
const MAX_STOPS = 10;

function secret(): string {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_SERVER_KEY is not set");
  return `walkr-share:${key}`;
}
const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url").slice(0, 22);

/** Walk → short URL-safe token. Positions are rounded to ~1 m. */
export function makeShareToken(walk: SharedWalk): string {
  const packed = [1, walk.parkId, walk.entranceId, walk.stops.map((s) => [s.kind, s.id ?? 0, +s.lat.toFixed(5), +s.lng.toFixed(5)])];
  const payload = Buffer.from(JSON.stringify(packed)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/** Token → walk, or null if it wasn't made by us, was tampered with, or doesn't look right. */
export function readShareToken(token: string): SharedWalk | null {
  const [payload, signature, ...rest] = token.split(".");
  if (!payload || !signature || rest.length || token.length > 4000) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const [version, parkId, entranceId, stops] = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (version !== 1 || typeof parkId !== "string" || typeof entranceId !== "string" || !Array.isArray(stops)) return null;
    if (!stops.length || stops.length > MAX_STOPS) return null;
    const parsed: SharedStop[] = [];
    for (const s of stops) {
      if (!Array.isArray(s) || !KINDS.has(s[0]) || typeof s[2] !== "number" || typeof s[3] !== "number") return null;
      parsed.push({ kind: s[0], id: typeof s[1] === "string" ? s[1] : undefined, lat: s[2], lng: s[3] });
    }
    return { parkId, entranceId, stops: parsed };
  } catch {
    return null;
  }
}
