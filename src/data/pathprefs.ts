import summary from "./pathprefs.json";

type Summary = Record<string, { hasWaterfront: boolean; lightingCoverage: number }>;
const data = summary as Summary;

/** Small, browser-safe summary of src/data/pathinfo.json (which stays on the server). */
export function pathPrefsFor(parkId: string): { hasWaterfront: boolean; lightingCoverage: number } {
  return data[parkId] ?? { hasWaterfront: false, lightingCoverage: 0 };
}
