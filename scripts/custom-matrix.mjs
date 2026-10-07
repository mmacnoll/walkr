// Customize mode check: random picks in every park, comparing the live tracker's estimate
// with Google's real walking distance and time.  Run (with `npm run dev` going):
//   node scripts/custom-matrix.mjs [walksPerPark=2]
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const perPark = Number(process.argv[2] ?? 2);
const parks = JSON.parse(readFileSync("src/data/parks.json", "utf8"));
const sights = JSON.parse(readFileSync("src/data/sights.json", "utf8")).parks;
const MIN_PER_MILE = 22.4; // keep in step with GOOGLE_MINUTES_PER_MILE in src/lib/customWalk.ts

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

const rows = [];
for (const park of parks.parks ?? parks) {
  const pool = sights[park.id] ?? [];
  if (pool.length < 2) continue;
  const entrance = park.entrances.find((e) => e.isDefault) ?? park.entrances[0];
  for (let k = 0; k < perPark; k++) {
    const n = Math.min(pool.length, 2 + Math.floor(rand() * 5));
    const placeIds = [...pool].sort(() => rand() - 0.5).slice(0, n).map((s) => s.placeId);
    const res = await fetch(`${BASE}/api/route`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "custom", parkId: park.id, entranceId: entrance.id, placeIds, includeNames: false }),
    });
    const j = await res.json();
    if (!res.ok) {
      console.log(`${park.name} | ${n} picks | ERROR ${j.error}`);
      continue;
    }
    const est = j.attempts[0].estimatedMeters;
    const row = {
      park: park.name, picks: n, estMi: est / 1609.344, realMi: j.distanceMeters / 1609.344,
      estMin: (est / 1609.344) * MIN_PER_MILE, realMin: j.durationSeconds / 60, winding: j.attempts[0].detour,
    };
    rows.push(row);
    console.log(`${row.park} | ${n} picks | est ${row.estMi.toFixed(2)} mi / ${row.estMin.toFixed(0)} min | real ${row.realMi.toFixed(2)} mi / ${row.realMin.toFixed(0)} min | winding ${row.winding}`);
  }
}
const avg = (f) => rows.reduce((a, r) => a + f(r), 0) / rows.length;
console.log(`\n${rows.length} walks`);
console.log(`distance error: avg ${(avg((r) => Math.abs(r.estMi / r.realMi - 1)) * 100).toFixed(1)}%, bias ${(avg((r) => r.estMi / r.realMi - 1) * 100).toFixed(1)}%`);
console.log(`time error:     avg ${(avg((r) => Math.abs(r.estMin / r.realMin - 1)) * 100).toFixed(1)}%, bias ${(avg((r) => r.estMin / r.realMin - 1) * 100).toFixed(1)}%`);
console.log(`Google's pace: ${(avg((r) => r.realMin / r.realMi)).toFixed(1)} min per mile; average winding ${avg((r) => r.winding).toFixed(2)}`);
