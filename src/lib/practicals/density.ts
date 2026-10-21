/** Population density. Pure functions. */
import { parseCellNumber } from "@/lib/thematic/numbers";
import { fmt, tidy, type Parsed } from "./scale";

export const AREA_UNITS = ["km2", "ha"] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];
export const AREA_UNIT_LABEL: Record<AreaUnit, string> = { km2: "km²", ha: "hectares (ha)" };
const TO_KM2: Record<AreaUnit, number> = { km2: 1, ha: 0.01 };

export const MAX_POPULATION = 20_000_000_000;
export const MAX_AREA_KM2 = 520_000_000; // about the surface area of the Earth

export interface DensityResult {
  population: number;
  areaKm2: number;
  density: number;
  formula: string;
  steps: string[];
}

export function populationDensity(populationText: string, areaText: string, unit: string): Parsed<DensityResult> {
  if (!(AREA_UNITS as readonly string[]).includes(unit)) return { ok: false, error: "Choose km² or hectares for the area." };
  const u = unit as AreaUnit;
  const p = parseCellNumber(populationText);
  if (p.kind === "missing") return { ok: false, error: "Enter the population." };
  if (p.kind === "invalid") return { ok: false, error: `Population must be a number (${p.reason}).` };
  if (!Number.isInteger(p.value) || p.value < 0) return { ok: false, error: "Population must be a whole number of people, zero or more." };
  if (p.value > MAX_POPULATION) return { ok: false, error: "That population is larger than the world population." };

  const a = parseCellNumber(areaText);
  if (a.kind === "missing") return { ok: false, error: "Enter the area." };
  if (a.kind === "invalid") return { ok: false, error: `Area must be a number (${a.reason}).` };
  if (a.value <= 0) return { ok: false, error: "Area must be greater than zero (you cannot divide by zero)." };
  const areaKm2 = a.value * TO_KM2[u];
  if (areaKm2 > MAX_AREA_KM2) return { ok: false, error: "That area is larger than the surface of the Earth." };

  const density = p.value / areaKm2;
  const steps = [
    u === "km2" ? `Area = ${fmt(a.value)} km².` : `Convert hectares to km² (100 ha = 1 km²): ${fmt(a.value)} ha = ${fmt(areaKm2, 6)} km².`,
    `Density = population ÷ area = ${fmt(p.value, 0)} ÷ ${fmt(areaKm2, 6)}.`,
    `Density = ${fmt(tidy(density, 2), 2)} people per km².`,
  ];
  return { ok: true, value: { population: p.value, areaKm2, density, formula: "Population density = total population ÷ area (km²)", steps } };
}
