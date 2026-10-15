// Collects, for each park, which paths OpenStreetMap marks as lit / unlit and where the water's
// edge is (rivers, harbor, lakes), for the "Well lit" and "Waterfront" preferences.
// Writes src/data/pathinfo.json (server-side only) and a tiny src/data/pathprefs.json the browser
// uses to grey out options.  Run: node scripts/pathinfo-build.mjs
// Data © OpenStreetMap contributors, ODbL. https://www.openstreetmap.org/copyright
import { readFileSync, writeFileSync } from "node:fs";

const OUT_FILE = "src/data/pathinfo.json";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const MARGIN_DEG = 0.004; // ~400 m around the park outline
const SIMPLIFY_M = 4;
/** Ignore decorative pools and fountains: only shorelines at least this long count as "water". */
const MIN_SHORE_M = 300;
/** The park "has a waterfront" if real water comes this close to its outline. */
const WATERFRONT_REACH_M = 200;
const WALKABLE = /^(footway|path|pedestrian|cycleway|steps|living_street|residential|service|unclassified|tertiary|secondary|primary|track|bridleway)$/;

const parks = JSON.parse(readFileSync("src/data/parks.json", "utf8"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(q) {
  for (let i = 0; i < 24; i++) {
    const res = await fetch(OVERPASS[i % OVERPASS.length], {
      method: "POST",
      headers: { "User-Agent": "walkr-class-project/0.1", "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(q),
    }).catch(() => null);
    if (res?.ok) return (await res.json()).elements;
    await sleep(5000);
  }
  throw new Error("OpenStreetMap (Overpass) didn't answer");
}

// Douglas–Peucker in local meters, to keep the file small.
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  const mLat = 111_320, mLng = 111_320 * Math.cos((pts[0].lat * Math.PI) / 180);
  const d = (p, a, b) => {
    const ax = (a.lng - p.lng) * mLng, ay = (a.lat - p.lat) * mLat, bx = (b.lng - p.lng) * mLng, by = (b.lat - p.lat) * mLat;
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
    return Math.hypot(ax + t * dx, ay + t * dy);
  };
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const dd = d(pts[i], pts[0], pts[pts.length - 1]);
    if (dd > maxD) [maxD, idx] = [dd, i];
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}
const pack = (geom) => simplify(geom.map((g) => ({ lat: g.lat, lng: g.lon })), SIMPLIFY_M).map((p) => [+p.lat.toFixed(5), +p.lng.toFixed(5)]);
const lengthM = (line) => {
  let t = 0;
  for (let i = 1; i < line.length; i++) {
    const [a, b] = [line[i - 1], line[i]];
    t += Math.hypot((b[0] - a[0]) * 111_320, (b[1] - a[1]) * 111_320 * Math.cos((a[0] * Math.PI) / 180));
  }
  return t;
};

const out = { refreshedAt: new Date().toISOString().slice(0, 10), parks: {} };
for (const park of parks) {
  const lats = park.boundary.flat().map((p) => p.lat), lngs = park.boundary.flat().map((p) => p.lng);
  const bbox = `${Math.min(...lats) - MARGIN_DEG},${Math.min(...lngs) - MARGIN_DEG},${Math.max(...lats) + MARGIN_DEG},${Math.max(...lngs) + MARGIN_DEG}`;
  const els = await overpass(`[out:json][timeout:120];
(way["highway"](${bbox});
 way["natural"="water"](${bbox}); relation["natural"="water"](${bbox});
 way["natural"="coastline"](${bbox}); way["waterway"="riverbank"](${bbox}););
out geom(${bbox}) tags;`);
  const lit = [], unlit = [], water = [];
  let walkable = 0;
  for (const e of els) {
    const t = e.tags ?? {};
    if (e.type === "way" && t.highway && WALKABLE.test(t.highway) && e.geometry?.length > 1) {
      const line = pack(e.geometry.filter(Boolean));
      walkable += lengthM(line);
      if (t.lit === "yes" || t.lit === "24/7" || t.lit === "automatic") lit.push(line);
      else if (t.lit === "no") unlit.push(line);
    } else if (t.natural === "water" || t.natural === "coastline" || t.waterway === "riverbank") {
      // Edges of water areas (or the coastline itself), clipped to the park's surroundings.
      const rings = e.type === "relation" ? (e.members ?? []).filter((m) => m.geometry).map((m) => m.geometry) : [e.geometry ?? []];
      for (const g of rings) {
        const pts = g.filter(Boolean);
        if (pts.length > 1) {
          const line = pack(pts);
          if (lengthM(line) >= MIN_SHORE_M) water.push(line);
        }
      }
    }
  }
  const litM = lit.reduce((a, l) => a + lengthM(l), 0), unlitM = unlit.reduce((a, l) => a + lengthM(l), 0);
  // Does real water come near the park? (Checks each shoreline point against the outline's corners and edges.)
  const mLat = 111_320, mLng = 111_320 * Math.cos((park.center.lat * Math.PI) / 180);
  const near = (p) =>
    park.boundary.some((ring) =>
      ring.some((a, i) => {
        const b = ring[(i + 1) % ring.length];
        const ax = (a.lng - p[1]) * mLng, ay = (a.lat - p[0]) * mLat, bx = (b.lng - p[1]) * mLng, by = (b.lat - p[0]) * mLat;
        const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
        return Math.hypot(ax + t * dx, ay + t * dy) <= WATERFRONT_REACH_M;
      }),
    );
  out.parks[park.id] = {
    hasWaterfront: water.some((line) => line.some(near)),
    /** Share of walkable path length with any lighting tag (yes or no): how much we know. */
    lightingCoverage: walkable ? +((litM + unlitM) / walkable).toFixed(2) : 0,
    lit,
    unlit,
    water,
  };
  console.log(
    park.name.padEnd(28),
    `lit ${(litM / 1000).toFixed(1)} km · unlit ${(unlitM / 1000).toFixed(1)} km · tagged ${Math.round(out.parks[park.id].lightingCoverage * 100)}% · water edges ${water.length}${out.parks[park.id].hasWaterfront ? " (waterfront)" : ""}`,
  );
  await sleep(1500); // be gentle with the free Overpass servers
}
writeFileSync(OUT_FILE, JSON.stringify(out) + "\n");
const summary = Object.fromEntries(Object.entries(out.parks).map(([id, p]) => [id, { hasWaterfront: p.hasWaterfront, lightingCoverage: p.lightingCoverage }]));
writeFileSync("src/data/pathprefs.json", JSON.stringify(summary, null, 2) + "\n");
console.log(`Wrote ${OUT_FILE} and src/data/pathprefs.json`);
