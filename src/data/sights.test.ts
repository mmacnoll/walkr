import { describe, expect, it } from "vitest";
import { parks } from "./parks";
import sightsJson from "./sights.json";

const data = sightsJson as { refreshedAt?: string; parks: Record<string, { placeId: string; moods: string[] }[]> };

describe("sights data", () => {
  it("was refreshed within the last 30 days (Google's limit for storing coordinates)", () => {
    expect(data.refreshedAt, "sights.json has no refreshedAt date").toBeTruthy();
    const ageDays = (Date.now() - new Date(data.refreshedAt!).getTime()) / 86_400_000;
    expect(ageDays, "Sights are older than 30 days. Run: npm run refresh:sights").toBeLessThanOrEqual(30);
  });

  it("only has parks we know about", () => {
    const ids = new Set(parks.map((p) => p.id));
    for (const parkId of Object.keys(data.parks)) expect(ids.has(parkId)).toBe(true);
  });

  it("has unique place ids and at least one mood per sight", () => {
    for (const list of Object.values(data.parks)) {
      expect(new Set(list.map((s) => s.placeId)).size).toBe(list.length);
      for (const s of list) expect(s.moods.length).toBeGreaterThan(0);
    }
  });
});
