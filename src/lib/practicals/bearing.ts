/** Compass bearing helpers. Pure functions. */
import { parseCellNumber } from "@/lib/thematic/numbers";

const POINTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

/** Bearing in degrees clockwise from north, 0 <= b < 360. Returns null for invalid text. */
export function parseBearing(raw: string): number | null {
  const c = parseCellNumber(raw);
  if (c.kind !== "number") return null;
  if (c.value < 0 || c.value >= 360) return null;
  return c.value;
}

export function bearingToCompass(bearing: number): (typeof POINTS)[number] {
  const index = Math.round((((bearing % 360) + 360) % 360) / 45) % 8;
  return POINTS[index] ?? "N";
}

export function backBearing(bearing: number): number {
  return Number((((bearing + 180) % 360)).toFixed(6));
}
