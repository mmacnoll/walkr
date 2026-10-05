import type { NextRequest } from "next/server";
import { isKnownPlaceId } from "@/data/sights";
import { getPlaceSummary } from "@/lib/places";

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/place/[placeId]">) {
  const { placeId } = await ctx.params;
  if (!isKnownPlaceId(placeId)) {
    return Response.json({ error: "Unknown place" }, { status: 404 });
  }
  try {
    const summary = await getPlaceSummary(placeId);
    return Response.json(summary, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Couldn't look up this place right now." }, { status: 502 });
  }
}
