import type { Amenity, ExtraStop } from "@/lib/types";
import amenitiesJson from "./amenities.json";

type AmenitiesFile = { refreshedAt: string; parks: Record<string, Partial<Record<ExtraStop, Amenity[]>>> };
const data = amenitiesJson as AmenitiesFile;

/** Date the amenities were collected (re-run scripts/amenities-build.mjs to refresh). */
export const amenitiesRefreshedAt = data.refreshedAt;

/** Restrooms / drinking fountains / playgrounds / dog runs in or right next to a park. */
export function getAmenities(parkId: string, type: ExtraStop): Amenity[] {
  return data.parks[parkId]?.[type] ?? [];
}
