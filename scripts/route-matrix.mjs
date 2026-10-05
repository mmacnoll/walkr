// Requests a walk for every park × mood × length from the running dev server and reports
// how close each one lands to its target.  Run (with `npm run dev` going):
//   node scripts/route-matrix.mjs [moods=scenic,quiet,coffee,lunch] [minutes=20,45]
import { readFileSync } from "node:fs";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const moods = (process.argv[2] ?? "scenic,quiet,coffee,lunch").split(",");
const minutesList = (process.argv[3] ?? "20,45").split(",").map(Number);
const parks = JSON.parse(readFileSync("src/data/parks.json", "utf8"));

const rows = [];
for (const park of parks) {
  const entrance = park.entrances.find((e) => e.isDefault);
  for (const mood of moods)
    for (const minutes of minutesList) {
      const target = Math.round((minutes / 20) * 1609.344);
      const t0 = Date.now();
      const res = await fetch(`${BASE}/api/route`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parkId: park.id, entranceId: entrance.id, mood, distanceMeters: target, seed: 1, includeNames: false }),
      });
      const j = await res.json();
      const row = { park: park.name, mood, minutes, ms: Date.now() - t0 };
      if (!res.ok) Object.assign(row, { error: j.error });
      else
        Object.assign(row, {
          off: `${(((j.distanceMeters - target) / target) * 100).toFixed(0)}%`,
          ok: j.withinTarget ? "✓" : "✗",
          stops: j.stops.length,
          food: j.stops.some((s) => s.kind === "coffee" || s.kind === "lunch") ? "yes" : mood === "coffee" || mood === "lunch" ? "NO" : "",
          routeCalls: j.attempts?.length,
          note: j.note ?? "",
        });
      rows.push(row);
      console.log(Object.values(row).join(" | "));
    }
}
const done = rows.filter((r) => !r.error);
console.log(`\n${done.filter((r) => r.ok === "✓").length}/${done.length} within ±15%, ${rows.length - done.length} errors, avg ${(
  done.reduce((s, r) => s + r.routeCalls, 0) / Math.max(1, done.length)
).toFixed(1)} Routes calls per walk`);
