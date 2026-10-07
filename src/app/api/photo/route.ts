import type { NextRequest } from "next/server";
import { getPhotoUri } from "@/lib/places";
import { verifyPhotoToken } from "@/lib/photoToken";

/** GET /api/photo?t=<signed token>  →  redirect to Google's image (the key stays on our server). */
export async function GET(request: NextRequest) {
  const name = verifyPhotoToken(request.nextUrl.searchParams.get("t") ?? "");
  if (!name) return Response.json({ error: "Unknown photo" }, { status: 404 });
  try {
    const uri = await getPhotoUri(name);
    // The browser may reuse this for 10 minutes, so re-opening a popup doesn't cost another photo.
    return new Response(null, { status: 302, headers: { Location: uri, "Cache-Control": "private, max-age=600" } });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Couldn't load this photo right now." }, { status: 502 });
  }
}
