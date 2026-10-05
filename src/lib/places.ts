// Server-side Google Places helpers. Uses the server key, which never reaches the browser.

const PLACES_URL = "https://places.googleapis.com/v1/places";

export type PlaceSummary = { name: string; type?: string };

/** Looks up a place's display name live (Google's terms don't allow storing names). */
export async function getPlaceSummary(placeId: string): Promise<PlaceSummary> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_SERVER_KEY is not set");

  const res = await fetch(`${PLACES_URL}/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": key,
      // Ask only for what we show; keeps the call in a cheaper pricing tier.
      "X-Goog-FieldMask": "displayName,primaryTypeDisplayName",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Places lookup failed: HTTP ${res.status}`);
  const json = await res.json();
  return { name: json.displayName?.text ?? "Unnamed place", type: json.primaryTypeDisplayName?.text };
}
