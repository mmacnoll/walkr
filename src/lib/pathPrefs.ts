// "Well lit" and "Waterfront" preferences (server only: the path data is ~400 KB).
// - Measures how much of a walking route runs on paths OpenStreetMap marks as lit, or along water.
// - Gives a small bonus to sights on lit paths / near the water, so the planner leans that way.
import { decode } from "@googlemaps/polyline-codec";
import pathInfoJson from "@/data/pathinfo.json";
import type { LatLng } from "./types";

import type { Preference } from "./walk";

export type { Preference };

type Line = [number, number][];
type ParkPaths = { hasWaterfront: boolean; lightingCoverage: number; lit: Line[]; unlit: Line[]; water: Line[] };
const data = pathInfoJson as unknown as { refreshedAt: string; parks: Record<string, ParkPaths> };

/** A route point this close to a lit/unlit path counts as being on it. */
const ON_PATH_M = 12;
/** A route point this close to a shoreline counts as "along the water". */
const ALONG_WATER_M = 80;
/** Sights this close to a lit path / the water get the preference bonus. */
const SIGHT_LIT_M = 20;
const SIGHT_WATER_M = 120;
const SAMPLE_EVERY_M = 20;

// --- spatial grid so lookups stay fast even with thousands of path segments ---
const CELL_DEG = 0.0006; // ~65 m
type Segment = [number, number, number, number]; // lat1, lng1, lat2, lng2
type Grid = Map<string, Segment[]>;

function buildGrid(lines: Line[]): Grid {
  const grid: Grid = new Map();
  for (const line of lines)
    for (let i = 1; i < line.length; i++) {
      const seg: Segment = [line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]];
      const [la1, la2] = [Math.min(seg[0], seg[2]), Math.max(seg[0], seg[2])];
      const [ln1, ln2] = [Math.min(seg[1], seg[3]), Math.max(seg[1], seg[3])];
      for (let a = Math.floor(la1 / CELL_DEG); a <= Math.floor(la2 / CELL_DEG); a++)
        for (let b = Math.floor(ln1 / CELL_DEG); b <= Math.floor(ln2 / CELL_DEG); b++) {
          const k = `${a}:${b}`;
          (grid.get(k) ?? grid.set(k, []).get(k)!).push(seg);
        }
    }
  return grid;
}

/** True if `p` is within `meters` of any segment in the grid. */
function within(grid: Grid, p: LatLng, meters: number): boolean {
  const mLat = 111_320, mLng = 111_320 * Math.cos((p.lat * Math.PI) / 180);
  const reach = Math.ceil(meters / 65);
  const ca = Math.floor(p.lat / CELL_DEG), cb = Math.floor(p.lng / CELL_DEG);
  for (let a = ca - reach; a <= ca + reach; a++)
    for (let b = cb - reach; b <= cb + reach; b++)
      for (const [la1, ln1, la2, ln2] of grid.get(`${a}:${b}`) ?? []) {
        const ax = (ln1 - p.lng) * mLng, ay = (la1 - p.lat) * mLat, bx = (ln2 - p.lng) * mLng, by = (la2 - p.lat) * mLat;
        const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
        if (Math.hypot(ax + t * dx, ay + t * dy) <= meters) return true;
      }
  return false;
}

const grids = new Map<string, { lit: Grid; unlit: Grid; water: Grid }>();
function gridsFor(parkId: string) {
  let g = grids.get(parkId);
  const park = data.parks[parkId];
  if (!g && park) grids.set(parkId, (g = { lit: buildGrid(park.lit), unlit: buildGrid(park.unlit), water: buildGrid(park.water) }));
  return g;
}

export function hasWaterfront(parkId: string): boolean {
  return data.parks[parkId]?.hasWaterfront ?? false;
}

/** Bonus added to a sight's planner score for the chosen preferences (0 when none apply). */
export function preferenceBonus(parkId: string, location: LatLng, prefs: Preference[]): number {
  const g = gridsFor(parkId);
  if (!g || !prefs.length) return 0;
  let bonus = 0;
  if (prefs.includes("lit")) bonus += within(g.lit, location, SIGHT_LIT_M) ? 0.35 : within(g.unlit, location, SIGHT_LIT_M) ? -0.4 : 0;
  if (prefs.includes("water") && hasWaterfront(parkId)) bonus += within(g.water, location, SIGHT_WATER_M) ? 0.6 : 0;
  return bonus;
}

export type PathStats = {
  /** % of the route on paths mapped as lit. */
  litPct: number;
  /** % on paths mapped as unlit. */
  unlitPct: number;
  /** % along the water (only meaningful where the park has a waterfront). */
  waterPct: number;
};

/** Samples the route every ~20 m and measures how much is lit / unlit / along the water. */
export function measureRoute(parkId: string, encodedPolyline: string): PathStats | null {
  const g = gridsFor(parkId);
  if (!g) return null;
  const pts = decode(encodedPolyline).map(([lat, lng]) => ({ lat, lng }));
  const samples: LatLng[] = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const d = Math.hypot((b.lat - a.lat) * 111_320, (b.lng - a.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180));
    const n = Math.max(1, Math.round(d / SAMPLE_EVERY_M));
    for (let k = 0; k < n; k++) samples.push({ lat: a.lat + ((b.lat - a.lat) * k) / n, lng: a.lng + ((b.lng - a.lng) * k) / n });
  }
  if (!samples.length) return null;
  let lit = 0, unlit = 0, water = 0;
  for (const p of samples) {
    if (within(g.lit, p, ON_PATH_M)) lit++;
    else if (within(g.unlit, p, ON_PATH_M)) unlit++;
    if (within(g.water, p, ALONG_WATER_M)) water++;
  }
  const pct = (n: number) => Math.round((n / samples.length) * 100);
  return { litPct: pct(lit), unlitPct: pct(unlit), waterPct: pct(water) };
}

/** How well a measured route satisfies the preferences (higher is better). */
export function preferenceScore(stats: PathStats | null, prefs: Preference[]): number {
  if (!stats) return 0;
  return (prefs.includes("lit") ? stats.litPct - 2 * stats.unlitPct : 0) + (prefs.includes("water") ? stats.waterPct : 0);
}
