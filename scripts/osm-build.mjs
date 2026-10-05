// Turns the OSM downloads in .cache/osm/ into park outlines and entrances in src/data/parks.json.
// Run after scripts/osm-fetch.mjs:  node scripts/osm-build.mjs
// Keeps each park's other fields (landmarks, path, kind…). Entrances marked `popular` are kept
// (with their friendly names) and snapped to the nearest real path crossing.
// Data © OpenStreetMap contributors, ODbL. https://www.openstreetmap.org/copyright
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { OSM_NAMES } from "./osm-names.mjs";

const PARKS_FILE = "src/data/parks.json";
const CAR_ROADS = /^(motorway|trunk|primary|secondary|tertiary)(_link)?$/;
const STREET_TYPES = /^(primary|secondary|tertiary|residential|unclassified|living_street)$/;
const MIN_CROSSING_ANGLE = 35; // degrees; flatter crossings are sidewalks running along the park edge
const MERGE_DISTANCE_M = 35; // crossings closer than this are one entrance
const SIMPLIFY_TOLERANCE_M = 4;
// Elevated parks: streets pass *under* them, so only stairs, elevators and deck-level paths count.
const ELEVATED = new Set(["the-high-line"]);
// Streets that run *below* a park (it's built over them), so they can't be entrances.
const STREETS_BELOW = { "brooklyn-heights-promenade": /^Furman St\b/ };
// Named "gates" that are not public entrances (subway emergency exits, rail yards, staff gates).
const NOT_AN_ENTRANCE = /emergency|exit|nyct|csx|railroad|maintenance|service|private|staff/i;

// ---------- small geometry helpers (local flat coordinates in meters) ----------
function projector(origin) {
  const mLat = 111_320;
  const mLng = 111_320 * Math.cos((origin.lat * Math.PI) / 180);
  return {
    xy: (p) => ({ x: (p.lng - origin.lng) * mLng, y: (p.lat - origin.lat) * mLat }),
    ll: (q) => ({ lat: Math.round((origin.lat + q.y / mLat) * 1e6) / 1e6, lng: Math.round((origin.lng + q.x / mLng) * 1e6) / 1e6 }),
  };
}

function segIntersect(a, b, c, d) {
  const r = { x: b.x - a.x, y: b.y - a.y };
  const s = { x: d.x - c.x, y: d.y - c.y };
  const den = r.x * s.y - r.y * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
  const u = ((c.x - a.x) * r.y - (c.y - a.y) * r.x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  const angle = (Math.acos(Math.abs(r.x * s.x + r.y * s.y) / (Math.hypot(r.x, r.y) * Math.hypot(s.x, s.y))) * 180) / Math.PI;
  return { x: a.x + t * r.x, y: a.y + t * r.y, angle };
}

function insideRing(p, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function distToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

function distToLine(p, pts, closed = false) {
  let best = Infinity;
  const n = pts.length;
  for (let i = 0; i < (closed ? n : n - 1); i++) best = Math.min(best, distToSegment(p, pts[i], pts[(i + 1) % n]));
  return best;
}

// Douglas–Peucker line simplification.
function simplify(pts, tol) {
  if (pts.length < 3) return pts;
  let maxD = 0, idx = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distToSegment(pts[i], pts[0], pts[pts.length - 1]);
    if (d > maxD) { maxD = d; idx = i; }
  }
  if (maxD <= tol) return [pts[0], pts[pts.length - 1]];
  return [...simplify(pts.slice(0, idx + 1), tol).slice(0, -1), ...simplify(pts.slice(idx), tol)];
}

// Join way pieces (lists of points) end-to-end into closed rings.
function stitch(pieces) {
  const key = (p) => `${p.lat.toFixed(7)},${p.lon.toFixed(7)}`;
  const rest = pieces.map((g) => [...g]);
  const rings = [];
  while (rest.length) {
    let ring = rest.shift();
    let grew = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < rest.length; i++) {
        const g = rest[i];
        const end = key(ring[ring.length - 1]);
        if (key(g[0]) === end) ring = ring.concat(g.slice(1));
        else if (key(g[g.length - 1]) === end) ring = ring.concat([...g].reverse().slice(1));
        else continue;
        rest.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

// Thin polygon around a line (for parks mapped only as a path).
function bufferLine(pts, width) {
  const left = [], right = [];
  pts.forEach((p, i) => {
    const a = pts[Math.max(0, i - 1)], c = pts[Math.min(pts.length - 1, i + 1)];
    const dx = c.x - a.x, dy = c.y - a.y, len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    left.push({ x: p.x + (nx * width) / 2, y: p.y + (ny * width) / 2 });
    right.push({ x: p.x - (nx * width) / 2, y: p.y - (ny * width) / 2 });
  });
  return [...left, ...right.reverse()];
}

// ---------- naming ----------
function shortStreet(name) {
  return name
    .replace(/^West (?=\d)/, "W ")
    .replace(/^East (?=\d)/, "E ")
    .replace(/\bStreet\b/g, "St")
    .replace(/\bAvenue\b/g, "Ave")
    .replace(/\bBoulevard\b/g, "Blvd")
    .replace(/\bDrive\b/g, "Dr")
    .replace(/\bPlace\b/g, "Pl")
    .replace(/\bParkway\b/g, "Pkwy")
    .replace(/\bRoad\b/g, "Rd")
    .replace(/\bTerrace\b/g, "Ter")
    .replace(/\bSquare\b/g, "Sq")
    .replace(/^Fifth Ave$/, "5th Ave");
}

const slug = (s) => s.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// ---------- main ----------
const parks = JSON.parse(readFileSync(PARKS_FILE, "utf8"));

for (const park of parks) {
  // Outlines are a list of rings (a park can have several pieces). Upgrade the old single-ring format.
  if (park.boundary.length && "lat" in park.boundary[0]) park.boundary = [park.boundary];

  const file = `.cache/osm/${park.id}.json`;
  if (!existsSync(file)) { console.log(`${park.name}: no download yet, skipped`); continue; }
  const { elements } = JSON.parse(readFileSync(file, "utf8"));
  const proj = projector(park.center);
  const nameRe = new RegExp(`^${OSM_NAMES[park.id]}$`, "i");

  // 1) Outline rings from leisure=park ways/relations with the park's name.
  const parkEls = elements.filter((e) => e.tags?.leisure === "park" && nameRe.test(e.tags.name ?? ""));
  let rings = [];
  for (const e of parkEls) {
    if (e.type === "way") rings.push(...stitch([e.geometry]));
    else rings.push(...stitch(e.members.filter((m) => m.type === "way" && m.role !== "inner" && m.geometry).map((m) => m.geometry)));
  }
  let ringsXY = rings.map((r) => r.map((p) => proj.xy({ lat: p.lat, lng: p.lon })));

  // Parks mapped only as a named path (e.g. a promenade): buffer the path into a thin outline.
  if (!ringsXY.length) {
    const lines = elements.filter((e) => e.type === "way" && e.tags?.highway && nameRe.test(e.tags.name ?? ""));
    // Use the main (longest) walkway; short side pieces would only create overlapping slivers.
    const main = lines.sort((x, y) => y.geometry.length - x.geometry.length)[0];
    if (main) ringsXY.push(bufferLine(main.geometry.map((p) => proj.xy({ lat: p.lat, lng: p.lon })), 18));
    console.log(`  ${park.name}: no park outline in OSM, using its main walkway`);
  }
  if (!ringsXY.length) { console.log(`${park.name}: nothing usable in OSM, kept old data`); continue; }

  // Drop slivers (tiny pieces) and simplify.
  ringsXY = ringsXY
    .map((r) => simplify(r, SIMPLIFY_TOLERANCE_M))
    .filter((r) => {
      let area = 0;
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) area += (r[j].x + r[i].x) * (r[j].y - r[i].y);
      return Math.abs(area / 2) > 150; // m²
    });
  const insideAny = (p) => ringsXY.some((r) => insideRing(p, r));

  // 2) Entrances: walkable ways crossing an outline ring at a real angle.
  const walkable = elements.filter((e) => {
    const t = e.tags ?? {};
    if (e.type !== "way" || !t.highway || !e.geometry) return false;
    if (CAR_ROADS.test(t.highway)) return false;
    if (ELEVATED.has(park.id)) return t.highway === "steps" || t.highway === "elevator" || Number(t.layer) >= 1;
    if (t.highway === "elevator") return false;
    if (t.tunnel === "yes" || t.foot === "no") return false;
    if ((t.access === "private" || t.access === "no") && t.foot !== "yes") return false;
    return true;
  });
  const crossings = [];
  for (const w of walkable) {
    const pts = w.geometry.map((p) => proj.xy({ lat: p.lat, lng: p.lon }));
    for (let ri = 0; ri < ringsXY.length; ri++) {
      const ring = ringsXY[ri];
      for (let i = 0; i < pts.length - 1; i++)
        for (let j = 0; j < ring.length; j++) {
          const hit = segIntersect(pts[i], pts[i + 1], ring[j], ring[(j + 1) % ring.length]);
          if (!hit || hit.angle < MIN_CROSSING_ANGLE) continue;
          // Ignore seams where two pieces of the same park touch (path stays in the park).
          const otherRings = ringsXY.filter((_, k) => k !== ri);
          if (otherRings.some((r) => insideRing(hit, r) || distToLine(hit, r, true) < 6)) continue;
          crossings.push({ x: hit.x, y: hit.y });
        }
    }
  }

  // Merge crossings that are close together.
  const merged = [];
  for (const c of crossings) {
    const near = merged.find((m) => Math.hypot(m.x - c.x, m.y - c.y) < MERGE_DISTANCE_M);
    if (near) { near.n++; near.x += (c.x - near.x) / near.n; near.y += (c.y - near.y) / near.n; }
    else merged.push({ ...c, n: 1 });
  }

  // 3) Names from the nearest streets outside the park (or a named gate nearby).
  const streets = elements
    .filter((e) => e.type === "way" && e.tags?.name && STREET_TYPES.test(e.tags.highway ?? "") && e.geometry)
    .map((e) => ({ name: e.tags.name, pts: e.geometry.map((p) => proj.xy({ lat: p.lat, lng: p.lon })) }))
    .filter((s) => {
      const insideCount = s.pts.filter(insideAny).length;
      return insideCount / s.pts.length < 0.5 && !nameRe.test(s.name) && !/Transverse/i.test(s.name); // not an interior park road
    });
  const allGates = elements.filter((e) => e.type === "node" && e.tags?.name).map((g) => ({ name: g.tags.name, ...proj.xy({ lat: g.lat, lng: g.lon }) }));
  const gates = allGates.filter((g) => !NOT_AN_ENTRANCE.test(g.name));
  const blockedGates = allGates.filter((g) => NOT_AN_ENTRANCE.test(g.name));
  // Named walkways, used to name entrances that have no street nearby (e.g. waterfronts).
  const namedPaths = elements
    .filter((e) => e.type === "way" && e.tags?.name && /^(footway|path|pedestrian|cycleway|steps)$/.test(e.tags.highway ?? "") && e.geometry && !nameRe.test(e.tags.name))
    .map((e) => ({ name: e.tags.name, pts: e.geometry.map((p) => proj.xy({ lat: p.lat, lng: p.lon })) }));

  // No cross street nearby: say which landmark it's near (our own hand-picked names).
  const landmarksXY = park.landmarks.map((l) => ({ name: l.name, ...proj.xy(l.location) }));
  function midBlock(p, street) {
    const near = landmarksXY.map((l) => ({ name: l.name, d: Math.hypot(l.x - p.x, l.y - p.y) })).sort((a, b) => a.d - b.d)[0];
    return near && near.d < 300 ? `${street} near ${near.name}` : `${street}, mid-block`;
  }

  function nameFor(p) {
    const gate = gates.find((g) => Math.hypot(g.x - p.x, g.y - p.y) < 40);
    const ranked = streets.map((s) => ({ name: s.name, d: distToLine(p, s.pts) })).sort((a, b) => a.d - b.d);
    const first = ranked[0];
    const second = ranked.find((s) => s.name !== first?.name && s.d < 110);
    const streetsLabel = first && first.d < 120 ? (second ? `${shortStreet(first.name)} & ${shortStreet(second.name)}` : midBlock(p, shortStreet(first.name))) : null;
    if (gate) return streetsLabel ? `${gate.name} (${streetsLabel})` : gate.name;
    if (streetsLabel) return streetsLabel;
    const path = namedPaths.map((s) => ({ name: s.name, d: distToLine(p, s.pts) })).sort((a, b) => a.d - b.d)[0];
    return path && path.d < 80 ? path.name : "Park entrance";
  }

  let entrances = merged
    .filter((m) => !blockedGates.some((g) => Math.hypot(g.x - m.x, g.y - m.y) < 25)) // e.g. paths to subway emergency exits
    .map((m) => ({ name: nameFor(m), location: proj.ll(m), xy: m }))
    .filter((e) => !STREETS_BELOW[park.id]?.test(e.name));

  // Same name used more than once: add a compass hint, then a number if still duplicated.
  const groups = {};
  for (const e of entrances) (groups[e.name] ||= []).push(e);
  for (const list of Object.values(groups)) {
    if (list.length < 2) continue;
    for (const e of list) {
      const dx = e.xy.x - list.reduce((s, o) => s + o.xy.x, 0) / list.length;
      const dy = e.xy.y - list.reduce((s, o) => s + o.xy.y, 0) / list.length;
      const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "east" : "west") : dy > 0 ? "north" : "south";
      e.name = `${e.name} (${dir} side)`;
    }
  }
  const seen = {};
  for (const e of entrances) { seen[e.name] = (seen[e.name] || 0) + 1; if (seen[e.name] > 1) e.name = `${e.name} #${seen[e.name]}`; }

  // 4) Keep popular (hand-picked) entrances: snap each to the nearest crossing and reuse its friendly name.
  // First run: every existing entrance was hand-picked, so all of them count as popular.
  const hasPopular = park.entrances.some((e) => e.popular);
  const popular = hasPopular ? park.entrances.filter((e) => e.popular) : park.entrances;
  for (const pe of popular) {
    const p = proj.xy(pe.location);
    const nearest = entrances.map((e) => ({ e, d: Math.hypot(e.xy.x - p.x, e.xy.y - p.y) })).sort((a, b) => a.d - b.d)[0];
    if (nearest && nearest.d < 150 && !nearest.e.popular) {
      nearest.e.name = pe.name;
      nearest.e.popular = true;
      if (pe.isDefault) nearest.e.isDefault = true;
    } else {
      // No crossing nearby: keep the hand-picked point as-is.
      entrances.push({ name: pe.name, location: pe.location, xy: p, popular: true, ...(pe.isDefault ? { isDefault: true } : {}) });
    }
  }
  entrances = entrances.filter((e) => e.popular || !entrances.some((o) => o.popular && Math.hypot(o.xy.x - e.xy.x, o.xy.y - e.xy.y) < 60));
  if (!entrances.some((e) => e.isDefault) && entrances.length) entrances[0].isDefault = true;

  // Stable order: popular first, then by name.
  entrances.sort((a, b) => Number(!!b.popular) - Number(!!a.popular) || a.name.localeCompare(b.name, "en", { numeric: true }));
  const usedIds = {};
  park.entrances = entrances.map((e) => {
    let id = slug(e.name);
    usedIds[id] = (usedIds[id] || 0) + 1;
    if (usedIds[id] > 1) id = `${id}-${usedIds[id]}`;
    return { id, name: e.name, location: e.location, ...(e.popular ? { popular: true } : {}), ...(e.isDefault ? { isDefault: true } : {}) };
  });
  park.boundary = ringsXY.map((r) => r.map((q) => proj.ll(q)));
  console.log(`${park.name}: ${park.boundary.length} outline piece(s), ${park.boundary.reduce((s, r) => s + r.length, 0)} points, ${park.entrances.length} entrances (${park.entrances.filter((e) => e.popular).length} popular)`);
}

// Write: compact {lat,lng} objects and mood arrays onto one line each.
const json = JSON.stringify(parks, null, 2)
  .replace(/\{\s+"lat": ([-\d.]+),\s+"lng": ([-\d.]+)\s+\}/g, '{ "lat": $1, "lng": $2 }')
  .replace(/\[\s+("[a-z]+"(?:,\s+"[a-z]+")*)\s+\]/g, (m, inner) => "[" + inner.replace(/\s+/g, " ") + "]");
writeFileSync(PARKS_FILE, json + "\n");
