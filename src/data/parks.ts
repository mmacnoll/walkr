import type { Park } from "@/lib/types";
import parksJson from "./parks.json";

export const parks = parksJson as Park[];

export function getPark(id: string): Park | undefined {
  return parks.find((p) => p.id === id);
}

export function defaultEntrance(park: Park) {
  return park.entrances.find((e) => e.isDefault) ?? park.entrances[0];
}
