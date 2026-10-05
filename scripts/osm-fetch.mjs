// Downloads OpenStreetMap data for each park (outline, nearby paths and streets, named gates)
// into .cache/osm/<park-id>.json. Run: node scripts/osm-fetch.mjs [park-id]
// Data © OpenStreetMap contributors, ODbL. https://www.openstreetmap.org/copyright
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { OSM_NAMES } from "./osm-names.mjs";

const MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];

// Parks that OSM maps as a named walkway rather than a park area.
const MAPPED_AS_PATH = new Set(["brooklyn-heights-promenade"]);

function query(park) {
  const re = OSM_NAMES[park.id];
  const c = `${park.center.lat},${park.center.lng}`;
  const pathClause = MAPPED_AS_PATH.has(park.id) ? `way["highway"]["name"~"^${re}$",i](around:600,${c});` : "";
  return `[out:json][timeout:120];
(way["leisure"="park"]["name"~"^${re}$",i](around:1200,${c});
 relation["leisure"="park"]["name"~"^${re}$",i](around:1200,${c});
 ${pathClause})->.p;
.p out geom;
way(around.p:150)["highway"];
out geom tags;
(node(around.p:60)["barrier"="gate"]["name"]; node(around.p:60)["entrance"]["name"];);
out;`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function overpass(q) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const url = MIRRORS[attempt % MIRRORS.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": "walkr-class-project/0.1", Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(150_000),
      });
      const text = await res.text();
      if (res.ok && text.startsWith("{")) return JSON.parse(text);
      console.log(`  ${new URL(url).host}: HTTP ${res.status}, retrying`);
    } catch (e) {
      console.log(`  ${new URL(url).host}: ${e.message}, retrying`);
    }
    await sleep(Math.min(60_000, 5000 * (attempt + 1)));
  }
  throw new Error("All Overpass attempts failed");
}

const parks = JSON.parse(readFileSync("src/data/parks.json", "utf8"));
const only = process.argv[2];
mkdirSync(".cache/osm", { recursive: true });
for (const park of parks) {
  if (only && park.id !== only) continue;
  const out = `.cache/osm/${park.id}.json`;
  if (existsSync(out) && !only) { console.log(`${park.id}: cached`); continue; }
  console.log(`${park.id}: downloading…`);
  const data = await overpass(query(park));
  writeFileSync(out, JSON.stringify(data));
  const kinds = {};
  for (const e of data.elements) {
    const k = e.tags?.leisure === "park" ? "park" : e.tags?.highway ? "highway" : e.type === "node" ? "gate" : "other";
    kinds[k] = (kinds[k] || 0) + 1;
  }
  console.log(`  ok: ${JSON.stringify(kinds)}`);
  await sleep(2000);
}
