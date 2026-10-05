import type { Sight } from "@/lib/types";
import sightsJson from "./sights.json";

type SightsFile = { refreshedAt?: string; parks: Record<string, Sight[]> };
const data = sightsJson as SightsFile;

/** Date the sights were last collected (YYYY-MM-DD). Coordinates must be refreshed within 30 days. */
export const sightsRefreshedAt = data.refreshedAt;

export function getSights(parkId: string): Sight[] {
  return data.parks[parkId] ?? [];
}

const allPlaceIds = new Set(Object.values(data.parks).flat().map((s) => s.placeId));

/** Only places from our own list may be looked up (so our key can't be used for anything else). */
export function isKnownPlaceId(placeId: string): boolean {
  return allPlaceIds.has(placeId);
}
