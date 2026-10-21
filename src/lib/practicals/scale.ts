/** Map scale conversion. Pure functions, no browser APIs. */
import { parseCellNumber } from "@/lib/thematic/numbers";

export const DISTANCE_UNITS = ["mm", "cm", "m"] as const;
export type MapUnit = (typeof DISTANCE_UNITS)[number];

const TO_CM: Record<MapUnit, number> = { mm: 0.1, cm: 1, m: 100 };
export const MAX_SCALE_DENOMINATOR = 100_000_000;
export const MAX_MAP_DISTANCE_CM = 10_000; // 100 m of paper is already absurd for a school map

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** "1:50,000", "1 : 50000" and "1/50000" are accepted; anything else is rejected. */
export function parseRepresentativeFraction(raw: string): Parsed<number> {
  const text = raw.trim();
  if (text === "") return { ok: false, error: "Enter the scale, for example 1:50,000." };
  const m = /^1\s*[:/]\s*([\d,]+)$/.exec(text);
  if (!m) return { ok: false, error: "Write the scale as 1:50,000 (the first number must be 1)." };
  const digits = (m[1] ?? "").replace(/,/g, "");
  const denominator = Number(digits);
  if (!/^\d+$/.test(digits) || !Number.isInteger(denominator) || denominator < 1) {
    return { ok: false, error: "The scale denominator must be a whole number of at least 1." };
  }
  if (denominator > MAX_SCALE_DENOMINATOR) return { ok: false, error: "That scale is too small to be realistic." };
  return { ok: true, value: denominator };
}

export function isMapUnit(value: string): value is MapUnit {
  return (DISTANCE_UNITS as readonly string[]).includes(value);
}

export function parsePositiveNumber(raw: string, label: string): Parsed<number> {
  const cell = parseCellNumber(raw);
  if (cell.kind === "missing") return { ok: false, error: `Enter ${label}.` };
  if (cell.kind === "invalid") return { ok: false, error: `${capitalise(label)} must be a number (${cell.reason}).` };
  if (cell.value <= 0) return { ok: false, error: `${capitalise(label)} must be greater than zero.` };
  return { ok: true, value: cell.value };
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export interface ScaleResult {
  denominator: number;
  mapCm: number;
  groundCm: number;
  groundMetres: number;
  groundKm: number;
  steps: string[];
}

/** Trim float noise (0.1 * 3 etc.) without hiding real precision. */
export function tidy(n: number, decimals = 6): number {
  return Number(n.toFixed(decimals));
}

export function fmt(n: number, decimals = 3): string {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: decimals }).format(tidy(n, decimals));
}

export function mapToGround(distanceText: string, unit: string, scaleText: string): Parsed<ScaleResult> {
  if (!isMapUnit(unit)) return { ok: false, error: "Choose mm, cm or m for the map distance." };
  const d = parsePositiveNumber(distanceText, "the map distance");
  if (!d.ok) return d;
  const s = parseRepresentativeFraction(scaleText);
  if (!s.ok) return s;
  const mapCm = d.value * TO_CM[unit];
  if (mapCm > MAX_MAP_DISTANCE_CM) return { ok: false, error: "That map distance is too large to be measured on a sheet of paper." };
  const groundCm = mapCm * s.value;
  const groundMetres = groundCm / 100;
  const groundKm = groundMetres / 1000;
  const steps = [
    `Scale 1:${fmt(s.value, 0)} means 1 unit on the map is ${fmt(s.value, 0)} of the same unit on the ground.`,
    unit === "cm" ? `Map distance = ${fmt(d.value)} cm.` : `Convert to centimetres: ${fmt(d.value)} ${unit} = ${fmt(mapCm)} cm.`,
    `Ground distance = map distance × scale denominator = ${fmt(mapCm)} × ${fmt(s.value, 0)} = ${fmt(groundCm)} cm.`,
    `Convert to metres (÷ 100): ${fmt(groundCm)} cm = ${fmt(groundMetres)} m.`,
    `Convert to kilometres (÷ 1,000): ${fmt(groundMetres)} m = ${fmt(groundKm)} km.`,
  ];
  return { ok: true, value: { denominator: s.value, mapCm, groundCm, groundMetres, groundKm, steps } };
}
