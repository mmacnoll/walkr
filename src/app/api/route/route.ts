import { getPark } from "@/data/parks";
import { getSights } from "@/data/sights";
import { maxPicks } from "@/lib/customWalk";
import { generateCustomWalk, generateSharedWalk, generateWalk } from "@/lib/generateWalk";
import { getPlaceSummary, searchFood } from "@/lib/places";
import { computeWalkingLoop } from "@/lib/routes";
import { makeShareToken, readShareToken } from "@/lib/shareToken";
import { errorResponse } from "@/lib/apiErrors";
import type { ExtraStop, Mood, Refreshment } from "@/lib/types";
import { isExtraStop, isRefreshment, MAX_TARGET_METERS, MIN_TARGET_METERS, type WalkResult } from "@/lib/walk";

const MOODS: Mood[] = ["scenic", "quiet"];

/** The optional refreshment: absent/null/"none" = none; anything else must be a known one. */
function parseRefreshment(value: unknown): Refreshment | undefined | "invalid" {
  if (value === undefined || value === null || value === "none") return undefined;
  return isRefreshment(value) ? value : "invalid";
}

/** Optional extra stops: a list of distinct known kinds (absent = none). */
function parseExtras(value: unknown): ExtraStop[] | "invalid" {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value) || value.length > 4 || !value.every(isExtraStop) || new Set(value).size !== value.length) return "invalid";
  return value;
}

/**
 * POST /api/route
 *   Surprise me: { parkId, entranceId, mood, refreshment?, distanceMeters, seed?, avoid?, includeNames? }
 *   Customize:   { mode: "custom", parkId, entranceId, placeIds: string[], refreshment?, extras? }
 *   extras: any of "restroom" | "water" | "playground" | "dogrun".
 *   Shared link: { mode: "shared", token }  (token from a previous walk's `share` field)
 *   refreshment: "coffee" | "lunch" | "treat". Older requests (mood "coffee"/"lunch", or `food`) still work.
 * Every walk comes back with a `share` token for a link that rebuilds it exactly.
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send the walk details as JSON." }, { status: 400 });
  }

  const deps = { computeRoute: computeWalkingLoop, searchFood, getPlaceSummary };

  if (body.mode === "shared") {
    const shared = typeof body.token === "string" ? readShareToken(body.token) : null;
    const sharedPark = shared ? getPark(shared.parkId) : undefined;
    const sharedEntrance = sharedPark?.entrances.find((e) => e.id === shared!.entranceId);
    if (!shared || !sharedPark || !sharedEntrance)
      return Response.json({ error: "This walk link isn't valid. Ask for a new link, or plan your own walk." }, { status: 400 });
    try {
      const walk = await generateSharedWalk({ park: sharedPark, entrance: sharedEntrance, stops: shared.stops }, deps);
      return ok(walk, sharedEntrance.id);
    } catch (err) {
      return errorResponse(err);
    }
  }

  // Check the input before spending any Google calls.
  const park = typeof body.parkId === "string" ? getPark(body.parkId) : undefined;
  if (!park) return Response.json({ error: "Unknown park." }, { status: 400 });
  const entrance = park.entrances.find((e) => e.id === body.entranceId);
  if (!entrance) return Response.json({ error: "Unknown entrance for this park." }, { status: 400 });
  const extras = parseExtras(body.extras);
  if (extras === "invalid") return Response.json({ error: "Unknown extra stops." }, { status: 400 });

  if (body.mode === "custom") {
    const food = parseRefreshment(body.refreshment ?? body.food);
    if (food === "invalid") return Response.json({ error: "Unknown refreshment." }, { status: 400 });
    const known = new Set(getSights(park.id).map((s) => s.placeId));
    const ids = Array.isArray(body.placeIds) ? body.placeIds : [];
    const placeIds = [...new Set(ids.filter((x): x is string => typeof x === "string"))];
    if (!placeIds.length) return Response.json({ error: "Pick at least one sight." }, { status: 400 });
    if (placeIds.length !== ids.length || placeIds.some((id) => !known.has(id)))
      return Response.json({ error: "Some picked sights aren't in this park." }, { status: 400 });
    const limit = maxPicks(!!food, extras.length);
    if (placeIds.length > limit)
      return Response.json({ error: `Pick up to ${limit} sights${food || extras.length ? " with the stops you've added" : ""}.` }, { status: 400 });
    try {
      const walk = await generateCustomWalk({ park, entrance, placeIds, refreshment: food, extras, includeNames: body.includeNames !== false }, deps);
      return ok(walk, entrance.id);
    } catch (err) {
      return errorResponse(err);
    }
  }

  // Before 2.0.2, coffee and lunch were moods; treat those as Scenic + that refreshment.
  const legacy = body.mood === "coffee" || body.mood === "lunch" ? body.mood : undefined;
  const mood = legacy ? "scenic" : MOODS.find((m) => m === body.mood);
  if (!mood) return Response.json({ error: "Unknown mood." }, { status: 400 });
  const refreshment = parseRefreshment(body.refreshment ?? legacy);
  if (refreshment === "invalid") return Response.json({ error: "Unknown refreshment." }, { status: 400 });
  const target = Number(body.distanceMeters);
  if (!Number.isFinite(target) || target < MIN_TARGET_METERS || target > MAX_TARGET_METERS)
    return Response.json({ error: `Walk length must be between ${MIN_TARGET_METERS} and ${MAX_TARGET_METERS} meters.` }, { status: 400 });
  const seed = Number.isInteger(body.seed) ? (body.seed as number) : Math.floor(Math.random() * 1e9);
  const avoid = Array.isArray(body.avoid) ? body.avoid.filter((x): x is string => typeof x === "string").slice(0, 20) : [];

  try {
    const walk = await generateWalk(
      { park, entrance, mood, refreshment, extras, targetMeters: target, seed, avoid, includeNames: body.includeNames !== false },
      deps,
    );
    return ok(walk, entrance.id);
  } catch (err) {
    return errorResponse(err);
  }
}


/** Success: the walk plus a signed token for a link that rebuilds exactly this walk. */
function ok(walk: WalkResult, entranceId: string): Response {
  if (!walk.stops.length) return Response.json(walk, { headers: { "Cache-Control": "no-store" } }); // nothing to share
  const share = makeShareToken({
    parkId: walk.parkId,
    entranceId,
    stops: walk.stops.map((s) => ({ kind: s.kind, id: s.placeId ?? (s.kind === "landmark" ? s.id : undefined), lat: s.location.lat, lng: s.location.lng })),
  });
  return Response.json({ ...walk, share }, { headers: { "Cache-Control": "no-store" } });
}
