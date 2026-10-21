/** Pure coordinate helpers for the Map Explorer (unit-tested, no browser APIs). */

export interface LatLng {
  lat: number;
  lng: number;
}

export type ParseResult = { ok: true; value: LatLng } | { ok: false; error: string };

const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

function parseOne(raw: string, label: string, limit: number): { ok: true; value: number } | { ok: false; error: string } {
  const text = raw.trim();
  if (text === "") return { ok: false, error: `Enter a ${label}.` };
  // Plain decimal degrees only: rejects "1e3", "NaN", "Infinity", hex and stray characters.
  if (!NUMBER.test(text)) return { ok: false, error: `${capitalise(label)} must be a number such as 28.6139.` };
  const value = Number(text);
  if (!Number.isFinite(value) || value < -limit || value > limit) {
    return { ok: false, error: `${capitalise(label)} must be between -${limit} and ${limit}.` };
  }
  return { ok: true, value };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Validates latitude (-90..90) and longitude (-180..180) typed as decimal degrees. */
export function parseCoordinates(latText: string, lngText: string): ParseResult {
  const lat = parseOne(latText, "latitude", 90);
  if (!lat.ok) return lat;
  const lng = parseOne(lngText, "longitude", 180);
  if (!lng.ok) return lng;
  return { ok: true, value: { lat: lat.value, lng: lng.value } };
}

/** A map can be panned past the date line; bring longitude back into -180..180. */
export function wrapLongitude(lng: number): number {
  if (!Number.isFinite(lng)) return 0;
  if (lng >= -180 && lng <= 180) return lng; // already valid: return untouched (no float noise)
  return ((((lng + 180) % 360) + 360) % 360) - 180;
}

export function clampLatitude(lat: number): number {
  return Math.min(90, Math.max(-90, lat));
}

/** 4 decimal places is about 11 m: plenty for a school-level map, honest about click accuracy. */
export const COORD_DECIMALS = 4;

function fixed(n: number): string {
  const s = n.toFixed(COORD_DECIMALS);
  return s === `-${(0).toFixed(COORD_DECIMALS)}` ? (0).toFixed(COORD_DECIMALS) : s; // never "-0.0000"
}

/** "28.6139, 77.2090" (what gets copied; pastes straight back into the search fields). */
export function formatDecimal({ lat, lng }: LatLng): string {
  return `${fixed(lat)}, ${fixed(lng)}`;
}

/** "28.6139° N, 77.2090° E" (what students see in geography class). */
export function formatDegrees({ lat, lng }: LatLng): string {
  const ns = lat > 0 ? " N" : lat < 0 ? " S" : "";
  const ew = lng > 0 && lng < 180 ? " E" : lng < 0 ? " W" : "";
  return `${fixed(Math.abs(lat))}°${ns}, ${fixed(Math.abs(lng))}°${ew}`;
}
