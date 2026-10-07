import { getPark } from "@/data/parks";
import { getSights } from "@/data/sights";
import { maxPicks } from "@/lib/customWalk";
import { generateCustomWalk, generateWalk } from "@/lib/generateWalk";
import { getPlaceSummary, searchFood } from "@/lib/places";
import { computeWalkingLoop } from "@/lib/routes";
import { errorResponse } from "@/lib/apiErrors";
import type { Mood } from "@/lib/types";
import { MAX_TARGET_METERS, MIN_TARGET_METERS } from "@/lib/walk";

const MOODS: Mood[] = ["scenic", "quiet", "coffee", "lunch"];

/**
 * POST /api/route
 *   Surprise me: { parkId, entranceId, mood, distanceMeters, seed?, avoid?, includeNames? }
 *   Customize:   { mode: "custom", parkId, entranceId, placeIds: string[], food?: "coffee" | "lunch" }
 */
export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Send the walk details as JSON." }, { status: 400 });
  }

  // Check the input before spending any Google calls.
  const park = typeof body.parkId === "string" ? getPark(body.parkId) : undefined;
  if (!park) return Response.json({ error: "Unknown park." }, { status: 400 });
  const entrance = park.entrances.find((e) => e.id === body.entranceId);
  if (!entrance) return Response.json({ error: "Unknown entrance for this park." }, { status: 400 });
  const deps = { computeRoute: computeWalkingLoop, searchFood, getPlaceSummary };

  if (body.mode === "custom") {
    const food = body.food === "coffee" || body.food === "lunch" ? body.food : undefined;
    if (body.food !== undefined && body.food !== null && !food) return Response.json({ error: "Unknown food stop." }, { status: 400 });
    const known = new Set(getSights(park.id).map((s) => s.placeId));
    const ids = Array.isArray(body.placeIds) ? body.placeIds : [];
    const placeIds = [...new Set(ids.filter((x): x is string => typeof x === "string"))];
    if (!placeIds.length) return Response.json({ error: "Pick at least one sight." }, { status: 400 });
    if (placeIds.length !== ids.length || placeIds.some((id) => !known.has(id)))
      return Response.json({ error: "Some picked sights aren't in this park." }, { status: 400 });
    if (placeIds.length > maxPicks(!!food))
      return Response.json({ error: `Pick up to ${maxPicks(!!food)} sights${food ? " with a food stop" : ""}.` }, { status: 400 });
    try {
      const walk = await generateCustomWalk({ park, entrance, placeIds, food, includeNames: body.includeNames !== false }, deps);
      return Response.json(walk, { headers: { "Cache-Control": "no-store" } });
    } catch (err) {
      return errorResponse(err);
    }
  }

  const mood = MOODS.find((m) => m === body.mood);
  if (!mood) return Response.json({ error: "Unknown mood." }, { status: 400 });
  const target = Number(body.distanceMeters);
  if (!Number.isFinite(target) || target < MIN_TARGET_METERS || target > MAX_TARGET_METERS)
    return Response.json({ error: `Walk length must be between ${MIN_TARGET_METERS} and ${MAX_TARGET_METERS} meters.` }, { status: 400 });
  const seed = Number.isInteger(body.seed) ? (body.seed as number) : Math.floor(Math.random() * 1e9);
  const avoid = Array.isArray(body.avoid) ? body.avoid.filter((x): x is string => typeof x === "string").slice(0, 20) : [];

  try {
    const walk = await generateWalk(
      { park, entrance, mood, targetMeters: target, seed, avoid, includeNames: body.includeNames !== false },
      deps,
    );
    return Response.json(walk, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return errorResponse(err);
  }
}

