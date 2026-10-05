// Server-side Google Places helpers. Uses the server key, which never reaches the browser.
import type { LatLng } from "./types";

const PLACES_URL = "https://places.googleapis.com/v1/places";

export type PlaceSummary = { name: string; type?: string };

function serverKey() {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_SERVER_KEY is not set");
  return key;
}

/** Looks up a place's display name live (Google's terms don't allow storing names). */
export async function getPlaceSummary(placeId: string): Promise<PlaceSummary> {
  const res = await fetch(`${PLACES_URL}/${encodeURIComponent(placeId)}`, {
    headers: {
      "X-Goog-Api-Key": serverKey(),
      // Ask only for what we show; keeps the call in a cheaper pricing tier.
      "X-Goog-FieldMask": "displayName,primaryTypeDisplayName",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`Places lookup failed: HTTP ${res.status}`);
  const json = await res.json();
  return { name: json.displayName?.text ?? "Unnamed place", type: json.primaryTypeDisplayName?.text };
}

export type FoodPlace = {
  placeId: string;
  name: string;
  location: LatLng;
  rating: number;
  ratingCount: number;
  openNow?: boolean;
  type?: string;
};

const FOOD_TYPES = {
  coffee: ["cafe", "coffee_shop"],
  lunch: ["sandwich_shop", "deli", "bakery", "pizza_restaurant", "restaurant", "cafe"],
};

/** Live search for cafés or casual lunch places near a point. */
export async function searchFood(kind: "coffee" | "lunch", center: LatLng, radiusMeters: number): Promise<FoodPlace[]> {
  const res = await fetch(`${PLACES_URL}:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": serverKey(),
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.location,places.rating,places.userRatingCount,places.currentOpeningHours.openNow,places.businessStatus,places.primaryTypeDisplayName",
    },
    body: JSON.stringify({
      includedTypes: FOOD_TYPES[kind],
      excludedPrimaryTypes: ["bar", "night_club", "fine_dining_restaurant", "steak_house"],
      maxResultCount: 20,
      rankPreference: "POPULARITY",
      locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: radiusMeters } },
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error?.message ?? `Places search failed: HTTP ${res.status}`);
  type ApiPlace = {
    id: string;
    displayName?: { text: string };
    location: { latitude: number; longitude: number };
    rating?: number;
    userRatingCount?: number;
    currentOpeningHours?: { openNow?: boolean };
    businessStatus?: string;
    primaryTypeDisplayName?: { text: string };
  };
  return ((json.places ?? []) as ApiPlace[])
    .filter((p) => !p.businessStatus || p.businessStatus === "OPERATIONAL")
    .map((p) => ({
      placeId: p.id,
      name: p.displayName?.text ?? "Café",
      location: { lat: p.location.latitude, lng: p.location.longitude },
      rating: p.rating ?? 0,
      ratingCount: p.userRatingCount ?? 0,
      openNow: p.currentOpeningHours?.openNow,
      type: p.primaryTypeDisplayName?.text,
    }));
}
