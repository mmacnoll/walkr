// Collects sights (points of interest) for each park from Google Places API (New)
// and writes src/data/sights.json.  Run:  npm run refresh:sights  [-- park-id]
//
// Google's terms allow storing place IDs indefinitely and coordinates for up to 30 days,
// but not names or other place details. So we save only: place ID, coordinates, our own
// mood tags, and the date. Names are looked up live when a sight is shown on a route.
// => Re-run this script at least every 30 days (a test reminds you).
import { readFileSync, writeFileSync, existsSync } from "node:fs";

const OUT_FILE = "src/data/sights.json";
const TILE_RADIUS_M = 350; // first-pass circle size inside parks
const WALK_ZONE_M = 600; // small/linear parks: also look this far beyond the edge
const WALK_ZONE_TILE_M = 600;
const MAX_RESULTS = 20; // Google's per-search limit

const INCLUDED_TYPES = [
  "tourist_attraction", "historical_landmark", "historical_place", "monument", "sculpture",
  "park", "garden", "botanical_garden", "scenic_spot", "zoo", "museum", "observation_deck",
  "plaza", "cultural_landmark", "visitor_center", "bridge", "fountain", "nature_preserve",
  "lake", "event_venue", "hiking_area", "marina", "beach",
];
// The walk zone around small/linear parks: only notable sights. Many businesses (escape rooms,
// shops) call themselves a "tourist_attraction", so outside the park we also require the
// place's *main* category to be a real sight.
const WALK_ZONE_TYPES = [
  "historical_landmark", "scenic_spot", "monument", "sculpture", "museum",
  "garden", "botanical_garden", "observation_deck", "plaza", "park", "tourist_attraction",
];
const WALK_ZONE_PRIMARY = new Set([
  "historical_landmark", "historical_place", "scenic_spot", "monument", "sculpture", "museum", "art_museum",
  "history_museum", "garden", "botanical_garden", "observation_deck", "plaza", "park", "cultural_landmark",
  "fountain", "bridge", "church", "place_of_worship",
]);
// Never stops: restrooms, sports/recreation, services.
const EXCLUDED_PRIMARY_TYPES = [
  "public_bathroom", "athletic_field", "sports_complex", "sports_activity_location", "ice_skating_rink",
  "swimming_pool", "stadium", "sports_club", "playground", "dog_park", "tour_agency", "travel_agency",
  "local_government_office", "tourist_information_center", "store", "gift_shop", "parking",
  "transit_station", "bus_stop", "subway_station",
];
const MUSEUM_TYPES = new Set(["museum", "art_museum", "art_gallery", "history_museum"]);
const SCENIC_TYPES = new Set([
  "tourist_attraction", "historical_landmark", "historical_place", "monument", "sculpture", "scenic_spot",
  "observation_deck", "bridge", "fountain", "castle", "cultural_landmark", "zoo", "museum", "art_museum",
  "history_museum", "plaza", "live_music_venue", "event_venue", "visitor_center", "lake", "marina", "beach",
]);
const QUIET_TYPES = new Set(["garden", "botanical_garden", "nature_preserve", "park", "picnic_ground", "wildlife_park", "hiking_area", "natural_feature"]);
// How far outside the mapped outline a sight may be and still count as "in" a large park.
// Riverside's monuments sit along Riverside Drive, just outside its OpenStreetMap outline.
const EDGE_ALLOWANCE_M = { default: 12, "riverside-park": 45 };
const WATER_WORDS = /\b(lake|pond|meer|pool|reservoir|water|falls?|waterfall|cove|loch|river|harbor|pier|beach|boat|fountain)\b/i;
const VIEW_WORDS = /\b(view|lookout|overlook|vista|point|rock|hill|castle|bridge|arch)\b/i;
const QUIET_WORDS = /\b(garden|gardens|woods?|glade|grove|meadow|ramble|sanctuary|pinetum|lawn|hill|walk|green|thicket|dell)\b/i;
const JUNK_WORDS = new RegExp(
  "\\b(" +
    [
      "tours?", "rentals?", "bench", "plaque", "studio", "space", "tree \\(#", "kiosk", "enforcement", "petekler",
      "audio guide", "pota", "office", "floral", "florist", "residence", "apartment", "mansion", "house museum shop",
      "field house", "field", "ballfield", "courts?", "playground", "sports center", "carriage", "ride", "strides",
      "luminar", "cruises?", "flea", "holiday market", "illusions", "artechouse", "arte museum", "workshop",
      "installation", "climb", "picnic tables", "launch ramp", "memorial tree", "ventilation", "edificio",
    ].join("|") +
    ")\\b|'s home$",
  "i",
);

// ---------- helpers ----------
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const KEY = env.GOOGLE_MAPS_SERVER_KEY;
if (!KEY) throw new Error("GOOGLE_MAPS_SERVER_KEY missing from .env.local");

const mLat = 1 / 111_320;
const mLngAt = (lat) => mLat / Math.cos((lat * Math.PI) / 180);
const dist = (a, b) => Math.hypot((a.lat - b.lat) / mLat, (a.lng - b.lng) / mLngAt(a.lat));
function insideRing(p, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) c = !c;
  }
  return c;
}
function distToRingEdge(p, ring) {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = { x: (ring[j].lng - p.lng) / mLngAt(p.lat), y: (ring[j].lat - p.lat) / mLat };
    const b = { x: (ring[i].lng - p.lng) / mLngAt(p.lat), y: (ring[i].lat - p.lat) / mLat };
    const dx = b.x - a.x, dy = b.y - a.y, len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len));
    best = Math.min(best, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return best;
}
const inPark = (p, rings) => rings.some((r) => insideRing(p, r));
const edgeDist = (p, rings) => Math.min(...rings.map((r) => distToRingEdge(p, r)));
const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\b(the|of|at|and|in)\b/g, " ").replace(/\s+/g, " ").trim();

let calls = 0;
class QuotaError extends Error {}
async function nearby(center, radius, includedTypes, withPopularity = false) {
  calls++;
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": KEY,
      // Only what we need; these fields are in the "Pro" pricing tier.
      // userRatingCount (only used to filter the walk zone) moves a search into the "Enterprise" tier.
      "X-Goog-FieldMask": "places.id,places.displayName,places.primaryType,places.types,places.location" + (withPopularity ? ",places.userRatingCount" : ""),
    },
    body: JSON.stringify({
      includedTypes,
      excludedPrimaryTypes: EXCLUDED_PRIMARY_TYPES,
      maxResultCount: MAX_RESULTS,
      locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius } },
    }),
  });
  const j = await res.json();
  if (res.status === 429 || j.error?.status === "RESOURCE_EXHAUSTED") throw new QuotaError(j.error?.message ?? "quota");
  if (j.error) throw new Error(j.error.message);
  return (j.places ?? []).map((p) => ({
    id: p.id,
    name: p.displayName?.text ?? "",
    primaryType: p.primaryType ?? "",
    types: p.types ?? [],
    location: { lat: p.location.latitude, lng: p.location.longitude },
    ratings: p.userRatingCount ?? 0,
  }));
}

// Meadows, lawns, hills, woods: Google files these as "natural_feature", which can't be used as a
// search filter, so ask in words instead (up to 3 pages of 20).
async function naturalFeatures(park) {
  const pts = park.boundary.flat();
  const rect = {
    low: { latitude: Math.min(...pts.map((p) => p.lat)), longitude: Math.min(...pts.map((p) => p.lng)) },
    high: { latitude: Math.max(...pts.map((p) => p.lat)), longitude: Math.max(...pts.map((p) => p.lng)) },
  };
  const out = [];
  let pageToken;
  for (let page = 0; page < 3; page++) {
    calls++;
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Goog-Api-Key": KEY, "X-Goog-FieldMask": "places.id,places.displayName,places.primaryType,places.types,places.location,nextPageToken" },
      body: JSON.stringify({ textQuery: `meadows, lawns, hills, woods and waterfalls in ${park.name}`, pageSize: 20, pageToken, locationRestriction: { rectangle: rect } }),
    });
    const j = await res.json();
    if (res.status === 429 || j.error?.status === "RESOURCE_EXHAUSTED") throw new QuotaError(j.error?.message ?? "quota");
    if (j.error) throw new Error(j.error.message);
    for (const p of j.places ?? [])
      if (p.primaryType === "natural_feature")
        out.push({ id: p.id, name: p.displayName?.text ?? "", primaryType: p.primaryType, types: p.types ?? [], location: { lat: p.location.latitude, lng: p.location.longitude }, ratings: 0 });
    pageToken = j.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

// Search a circle; if it comes back full, split it into four smaller circles —
// but only the ones that actually overlap the park (`rings`).
async function cover(center, radius, includedTypes, found, { rings, split = true, withPopularity = false } = {}) {
  const results = await nearby(center, radius, includedTypes, withPopularity);
  results.forEach((p) => found.set(p.id, p));
  if (split && results.length === MAX_RESULTS && radius > 60) {
    const d = radius / 2;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const child = { lat: center.lat + dy * d * mLat, lng: center.lng + dx * d * mLngAt(center.lat) };
      const childRadius = radius * 0.72;
      if (rings && !inPark(child, rings) && edgeDist(child, rings) > childRadius) continue;
      await cover(child, childRadius, includedTypes, found, { rings, split, withPopularity });
    }
  }
}

// Grid of circle centers over the rings' bounding box (plus margin), kept if near the park.
function tileCenters(rings, radius, margin) {
  const pts = rings.flat();
  const lat0 = pts[0].lat;
  const step = radius * 1.4;
  const minLat = Math.min(...pts.map((p) => p.lat)) - margin * mLat, maxLat = Math.max(...pts.map((p) => p.lat)) + margin * mLat;
  const minLng = Math.min(...pts.map((p) => p.lng)) - margin * mLngAt(lat0), maxLng = Math.max(...pts.map((p) => p.lng)) + margin * mLngAt(lat0);
  const out = [];
  for (let lat = minLat; lat <= maxLat + step * mLat * 0.5; lat += step * mLat)
    for (let lng = minLng; lng <= maxLng + step * mLngAt(lat0) * 0.5; lng += step * mLngAt(lat0)) {
      const c = { lat, lng };
      if (inPark(c, rings) || edgeDist(c, rings) < radius + margin) out.push(c);
    }
  return out;
}

function moodsFor(p) {
  const moods = new Set();
  if (SCENIC_TYPES.has(p.primaryType)) moods.add("scenic");
  if (QUIET_TYPES.has(p.primaryType)) moods.add("quiet");
  if (WATER_WORDS.test(p.name) || VIEW_WORDS.test(p.name)) moods.add("scenic");
  if (QUIET_WORDS.test(p.name)) moods.add("quiet");
  if (!moods.size) moods.add("scenic");
  return [...moods].sort();
}

function clean(places, park) {
  const parkName = norm(park.name);
  let list = places.filter((p) => {
    const n = norm(p.name);
    if (!n || n.length < 3 || /^(park|manhattan|brooklyn|new york)$/.test(n)) return false;
    if (/[^\x00-\x7F]/.test(p.name.replace(/[’‘“”–—éèáàüöçñ]/g, ""))) return false; // other-language duplicate pins
    if (n === parkName || n.startsWith(`${parkName} `) && n.split(" ").length <= parkName.split(" ").length + 2) return false;
    if (JUNK_WORDS.test(p.name)) return false;
    return true;
  });
  // One entry per museum: drop museum-type places within 150m of a more prominent museum.
  const keptMuseums = [];
  list = list.filter((p) => {
    if (!MUSEUM_TYPES.has(p.primaryType)) return true;
    if (keptMuseums.some((m) => dist(m.location, p.location) < 150)) return false;
    keptMuseums.push(p);
    return true;
  });
  // Duplicates: same/overlapping name nearby, or practically the same spot.
  const kept = [];
  for (const p of list) {
    const n = norm(p.name).replace(/\s/g, "");
    const dup = kept.find((k) => {
      const kn = norm(k.name).replace(/\s/g, "");
      const d = dist(k.location, p.location);
      return d < 12 || (d < 150 && (kn.includes(n) || n.includes(kn)));
    });
    if (!dup) kept.push(p);
  }
  return kept;
}

// ---------- main ----------
const parks = JSON.parse(readFileSync("src/data/parks.json", "utf8"));
const only = process.argv[2];
const existing = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, "utf8")) : { parks: {} };
const output = {
  source: "Google Places API (New). Only place IDs, coordinates and our own mood tags are stored, per Google's terms.",
  refreshedAt: existing.refreshedAt,
  parks: existing.parks ?? {},
};

try {
  for (const park of parks) {
    if (only && park.id !== only) continue;
    const before = calls;
    const found = new Map();
    // Inside the park: full coverage.
    // Circle size: no bigger than needed for small parks (so we don't pay to search the neighborhood).
    const pts = park.boundary.flat();
    const span = dist({ lat: Math.min(...pts.map((p) => p.lat)), lng: Math.min(...pts.map((p) => p.lng)) }, { lat: Math.max(...pts.map((p) => p.lat)), lng: Math.max(...pts.map((p) => p.lng)) });
    const radius = Math.min(TILE_RADIUS_M, Math.max(80, span / 2 + 20));
    for (const c of tileCenters(park.boundary, radius, 0)) await cover(c, radius, INCLUDED_TYPES, found, { rings: park.boundary });
    // Around small and linear parks: notable sights within a short walk (no splitting).
    for (const p of await naturalFeatures(park)) found.set(p.id, p);
    const foundNearby = new Map();
    if (park.kind !== "large")
      for (const c of tileCenters(park.boundary, WALK_ZONE_TILE_M, WALK_ZONE_M - WALK_ZONE_TILE_M / 2)) await cover(c, WALK_ZONE_TILE_M, WALK_ZONE_TYPES, foundNearby, { split: false, withPopularity: true });

    const MIN_RATINGS_NEARBY = 40; // real sights have plenty of reviews; small businesses and junk pins don't
    // Just outside the outline counts only for real sights (monuments etc.), not event venues or businesses.
    const inside = [...found.values()].filter((p) =>
      inPark(p.location, park.boundary) ||
      (park.kind === "large" && edgeDist(p.location, park.boundary) < (EDGE_ALLOWANCE_M[park.id] ?? EDGE_ALLOWANCE_M.default) && WALK_ZONE_PRIMARY.has(p.primaryType)));
    const insideIds = new Set(inside.map((p) => p.id));
    const nearby = [...foundNearby.values()].filter((p) =>
      !insideIds.has(p.id) &&
      edgeDist(p.location, park.boundary) <= WALK_ZONE_M && p.ratings >= MIN_RATINGS_NEARBY &&
      // Neighborhood churches are everywhere; only well-known ones count.
      !(["church", "place_of_worship"].includes(p.primaryType) && p.ratings < 500) &&
      (WALK_ZONE_PRIMARY.has(p.primaryType) ||
        // Famous buildings (Flatiron, Empire State…) are filed as generic "tourist_attraction",
        // like many businesses. Only very popular ones count.
        (p.primaryType === "tourist_attraction" && p.ratings >= 1500 && !/escape|\bvr\b|experience|immersive|museum of (ice|sex)/i.test(p.name))));
    const candidates = [...inside, ...nearby];
    const sights = clean(candidates, park).map((p) => ({
      placeId: p.id,
      location: { lat: Math.round(p.location.lat * 1e6) / 1e6, lng: Math.round(p.location.lng * 1e6) / 1e6 },
      moods: moodsFor(p),
      inPark: inPark(p.location, park.boundary),
    }));
    output.parks[park.id] = sights;
    output.refreshedAt = new Date().toISOString().slice(0, 10);
    writeFileSync(OUT_FILE, JSON.stringify(output, null, 1) + "\n");
    console.log(`${park.name}: ${sights.length} sights (${sights.filter((s) => s.inPark).length} in park) using ${calls - before} searches`);
    if (process.env.SHOW_NAMES) console.log("   " + clean(candidates, park).map((p) => p.name).sort().join(" | "));
  }
} catch (e) {
  if (e instanceof QuotaError) console.log(`\nStopped: Google quota reached (${e.message}). Parks finished so far are saved; re-run later to continue.`);
  else throw e;
}
console.log(`Total searches this run: ${calls}`);
