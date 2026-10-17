/** Activity progress and readiness-to-submit. Pure functions. */
import { parseCellNumber } from "@/lib/thematic/numbers";
import { populationDensity } from "./density";
import { completeRowCount } from "./rows";
import { mapToGround, parseRepresentativeFraction } from "./scale";
import type { MeasurementField, Practical, WorkspaceState } from "./types";

export const MIN_WEATHER_DAYS = 5;
export const MIN_INTERPRETATION = 30;
export const MIN_CONCLUSION = 20;
export const MIN_REFLECTION = 20;

export interface ProgressItem {
  id: string;
  label: string;
  done: boolean;
  /** What is missing, shown to the student. */
  hint?: string;
}

export interface Progress {
  items: ProgressItem[];
  done: number;
  total: number;
  percent: number;
  complete: boolean;
}

export function checkMeasurement(field: MeasurementField, raw: string): string | null {
  const text = (raw ?? "").trim();
  if (text === "") return `Enter ${field.label.toLowerCase()}.`;
  if (field.kind === "scale") {
    const r = parseRepresentativeFraction(text);
    return r.ok ? null : r.error;
  }
  const c = parseCellNumber(text);
  if (c.kind !== "number") return `${field.label} must be a number.`;
  if (field.min !== undefined && c.value < field.min) return `${field.label} must be at least ${field.min}.`;
  if (field.max !== undefined && c.value > field.max) return `${field.label} must be at most ${field.max}.`;
  return null;
}

function textItem(id: string, label: string, value: string, min: number): ProgressItem {
  const len = value.trim().length;
  return { id, label, done: len >= min, hint: len >= min ? undefined : `Write at least ${min} characters (${len} so far).` };
}

export function computeProgress(p: Practical, s: WorkspaceState): Progress {
  const items: ProgressItem[] = [];

  if (p.table) {
    const n = completeRowCount(p.table, s.rows);
    items.push({
      id: "table", label: `Observation table: ${p.table.minRows} complete rows`, done: n >= p.table.minRows,
      hint: n >= p.table.minRows ? undefined : `${n} of ${p.table.minRows} complete rows.`,
    });
  }
  for (const f of p.measurements) {
    const err = checkMeasurement(f, s.measurements[f.key] ?? "");
    items.push({ id: `m-${f.key}`, label: f.label, done: err === null, hint: err ?? undefined });
  }
  if (p.calculator === "scale") {
    const r = mapToGround(s.scale.distance, s.scale.unit, s.scale.scale);
    items.push({ id: "calc-scale", label: "Map scale calculation completed", done: r.ok, hint: r.ok ? undefined : "Enter a valid map distance and scale in the calculator." });
  }
  if (p.calculator === "density") {
    const r = populationDensity(s.density.population, s.density.area, s.density.unit);
    items.push({ id: "calc-density", label: "Density calculation completed", done: r.ok, hint: r.ok ? undefined : "Enter a valid population and area in the calculator." });
  }
  if (p.calculator === "weather") {
    const n = s.weather.length;
    items.push({ id: "calc-weather", label: `Weather log: ${MIN_WEATHER_DAYS} days`, done: n >= MIN_WEATHER_DAYS, hint: n >= MIN_WEATHER_DAYS ? undefined : `${n} of ${MIN_WEATHER_DAYS} days recorded.` });
  }
  items.push(textItem("interpretation", "Geographical interpretation", s.interpretation, MIN_INTERPRETATION));
  items.push(textItem("conclusion", "Conclusion", s.conclusion, MIN_CONCLUSION));
  items.push(textItem("reflection", "Reflection", s.reflection, MIN_REFLECTION));

  const done = items.filter((i) => i.done).length;
  return { items, done, total: items.length, percent: Math.round((done / items.length) * 100), complete: done === items.length };
}
