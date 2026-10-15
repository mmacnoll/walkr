// Collects extra-stop amenities for each park (restrooms, drinking fountains, playgrounds,
// dog runs) from NYC Parks open data + OpenStreetMap, and writes src/data/amenities.json.
// Run: node scripts/amenities-build.mjs
//
// Unlike Google places, this open data may be stored. Credit: NYC Open Data (NYC Parks) and
// © OpenStreetMap contributors (ODbL).
import { readFileSync, writeFileSync } from "node:fs";

const OUT_FILE = "src/data/amenities.json";
const NYC = "https://data.cityofnewyork.us/resource";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
/** How far outside the park edge an amenity still counts ("right next to the park"). */
const EDGE_BUFFER_M = { large: 50, small: 150, linear: 150 };
/** Playgrounds/dog runs from both sources closer than this are the same place. */
const SAME_PLACE_M = 60;

const parks = JSON.parse(readFileSync("src/data/parks.json", "utf8"));

// --- small geometry helpers (meters) ---
const R = 6_371_000;
const rad = (d) => (d * Math.PI) / 180;
function dist(a, b) {
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function inside(p, ring) {
  let on = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) on = !on;
  }
  return on;
}
function edgeDist(p, ring) {
  const mLat = 111_320, mLng = 111_320 * Math.cos(rad(p.lat));
  let best = Infinity;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length];
    const ax = (a.lng - p.lng) * mLng, ay = (a.lat - p.lat) * mLat, bx = (b.lng - p.lng) * mLng, by = (b.lat - p.lat) * mLat;
    const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len));
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
const nearPark = (park, p) => park.boundary.some((ring) => inside(p, ring)) || Math.min(...park.boundary.map((r) => edgeDist(p, r))) <= EDGE_BUFFER_M[park.kind];
function centroid(geom) {
  if (!geom) return null;
  if (geom.type === "Point") return { lat: geom.coordinates[1], lng: geom.coordinates[0] };
  const pts = JSON.stringify(geom.coordinates).match(/-?\d+\.\d+,-?\d+\.\d+/g).map((s) => s.split(",").map(Number));
  return { lat: pts.reduce((a, p) => a + p[1], 0) / pts.length, lng: pts.reduce((a, p) => a + p[0], 0) / pts.length };
}
const round = (p) => ({ lat: +p.lat.toFixed(6), lng: +p.lng.toFixed(6) });
const title = (s) => s?.trim().replace(/\s+/g, " ").replace(/\b([A-Z])([A-Z']+)\b/g, (_, a, b) => a + b.toLowerCase());

// --- downloads ---
async function nyc(id) {
  const res = await fetch(`${NYC}/${id}.json?$limit=50000`);
  if (!res.ok) throw new Error(`NYC Open Data ${id}: HTTP ${res.status}`);
  return res.json();
}
async function osm() {
  const lats = parks.flatMap((p) => p.boundary.flat().map((x) => x.lat)), lngs = parks.flatMap((p) => p.boundary.flat().map((x) => x.lng));
  const bbox = `${Math.min(...lats) - 0.01},${Math.min(...lngs) - 0.01},${Math.max(...lats) + 0.01},${Math.max(...lngs) + 0.01}`;
  const q = `[out:json][timeout:120];(nwr["leisure"="playground"](${bbox});nwr["leisure"="dog_park"](${bbox}););out center tags;`;
  for (let i = 0; i < 9; i++) {
    const res = await fetch(OVERPASS[i % OVERPASS.length], {
      method: "POST",
      headers: { "User-Agent": "walkr-class-project/0.1", "Content-Type": "application/x-www-form-urlencoded" },
      body: "data=" + encodeURIComponent(q),
    }).catch(() => null);
    if (res?.ok) return (await res.json()).elements.map((e) => ({ tags: e.tags ?? {}, location: { lat: e.lat ?? e.center.lat, lng: e.lon ?? e.center.lon } }));
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error("OpenStreetMap (Overpass) didn't answer");
}

console.log("Downloading NYC Parks data and OpenStreetMap…");
const [restroomRows, fountainRows, playgroundRows, dogRows, osmRows] = await Promise.all([
  nyc("i7jb-7jku"), // Public Restrooms (with operational status)
  nyc("qnv7-p7a2"), // NYC Parks Drinking Fountains
  nyc("j55h-3upk"), // Playgrounds with Dedicated Children's Areas
  nyc("hxx3-bwgv"), // Dog Runs
  osm(),
]);

const all = {
  restroom: restroomRows
    .filter((r) => r.latitude && /^operational$/i.test(r.status ?? ""))
    .map((r) => ({
      name: r.facility_name ? `Restroom at ${title(r.facility_name)}` : "Public restroom",
      detail: /yes/i.test(r.changing_stations ?? "") ? "Restroom · baby changing station" : "Restroom",
      location: { lat: +r.latitude, lng: +r.longitude },
      source: "nyc",
    })),
  water: fountainRows
    .map((r) => ({ name: "Drinking fountain", detail: "Drinking fountain", location: centroid(r.the_geom), source: "nyc" }))
    .filter((r) => r.location),
  playground: [
    ...playgroundRows.map((r) => ({ name: title(r.publicname) || "Playground", detail: "Playground", location: centroid(r.shape), source: "nyc" })),
    ...osmRows.filter((r) => r.tags.leisure === "playground").map((r) => ({ name: r.tags.name || "Playground", detail: "Playground", location: r.location, source: "osm" })),
  ].filter((r) => r.location),
  dogrun: [
    ...dogRows.map((r) => ({ name: title(r.name) || "Dog run", detail: /off/i.test(r.dog_area_type ?? "") ? "Off-leash area" : "Dog run", location: centroid(r.the_geom), source: "nyc" })),
    ...osmRows.filter((r) => r.tags.leisure === "dog_park").map((r) => ({ name: r.tags.name || "Dog run", detail: "Dog run", location: r.location, source: "osm" })),
  ].filter((r) => r.location),
};

/** Merge places from both sources that are the same place (keep the NYC Parks one, which has better names). */
function dedupe(list) {
  const kept = [];
  for (const p of [...list].sort((a, b) => (a.source === "nyc" ? -1 : 1) - (b.source === "nyc" ? -1 : 1)))
    if (!kept.some((k) => dist(k.location, p.location) < SAME_PLACE_M)) kept.push(p);
  return kept;
}

const out = { refreshedAt: new Date().toISOString().slice(0, 10), parks: {} };
for (const park of parks) {
  const entry = {};
  for (const [type, list] of Object.entries(all)) {
    const nearby = dedupe(list.filter((p) => nearPark(park, p.location)));
    entry[type] = nearby.map((p, i) => ({ id: `${park.id}:${type}:${i}`, name: p.name, detail: p.detail, location: round(p.location) }));
  }
  out.parks[park.id] = entry;
  console.log(park.name.padEnd(28), Object.entries(entry).map(([t, l]) => `${t} ${l.length}`).join(" · "));
}
writeFileSync(OUT_FILE, JSON.stringify(out) + "\n");
console.log(`Wrote ${OUT_FILE}`);
