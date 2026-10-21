/** Observation-table validation and computed columns. Pure functions. */
import { parseCellNumber } from "@/lib/thematic/numbers";
import { backBearing, bearingToCompass, parseBearing } from "./bearing";
import { fmt, mapToGround, parseRepresentativeFraction } from "./scale";
import type { ObservationTable, Practical, TableColumn, WorkspaceState } from "./types";

export type CellCheck = { ok: true } | { ok: false; error: string };

export function checkCell(col: TableColumn, raw: string): CellCheck {
  const text = (raw ?? "").trim();
  if (text === "") return col.required ? { ok: false, error: `${col.label} is required.` } : { ok: true };
  if (col.kind === "select") {
    return col.options?.includes(text) ? { ok: true } : { ok: false, error: `Choose one of the listed options for ${col.label}.` };
  }
  if (col.kind === "number") {
    const c = parseCellNumber(text);
    if (c.kind !== "number") return { ok: false, error: `${col.label} must be a number.` };
    if (col.min !== undefined && c.value < col.min) return { ok: false, error: `${col.label} must be at least ${col.min}.` };
    if (col.max !== undefined && c.value > col.max) return { ok: false, error: `${col.label} must be at most ${col.max}.` };
  }
  return { ok: true };
}

export function isRowBlank(row: Record<string, string>): boolean {
  return Object.values(row).every((v) => (v ?? "").trim() === "");
}

export function isRowComplete(table: ObservationTable, row: Record<string, string>): boolean {
  return table.columns.every((c) => checkCell(c, row[c.key] ?? "").ok && (!c.required || (row[c.key] ?? "").trim() !== ""));
}

export function completeRowCount(table: ObservationTable, rows: readonly Record<string, string>[]): number {
  return rows.filter((r) => !isRowBlank(r) && isRowComplete(table, r)).length;
}

/** Value of a computed column, or null when its inputs are not valid yet. */
export function computedValue(
  kind: "ground-km" | "compass" | "back-bearing",
  rawInput: string,
  measurements: Record<string, string>,
): string | null {
  if (kind === "ground-km") {
    const r = mapToGround(rawInput, "cm", `${measurements.scale ?? ""}`);
    return r.ok ? fmt(r.value.groundKm, 3) : null;
  }
  const b = parseBearing(rawInput);
  if (b === null) return null;
  return kind === "compass" ? bearingToCompass(b) : fmt(backBearing(b), 1);
}

export function reliefSummary(rows: readonly Record<string, string>[], column: string) {
  const values = rows.flatMap((r) => {
    const c = parseCellNumber(r[column] ?? "");
    return c.kind === "number" ? [c.value] : [];
  });
  if (values.length < 2) return null;
  const highest = Math.max(...values);
  const lowest = Math.min(...values);
  return { count: values.length, highest, lowest, relief: Number((highest - lowest).toFixed(6)) };
}

export function emptyRows(practical: Practical): Record<string, string>[] {
  const n = practical.table?.minRows ?? 0;
  return Array.from({ length: n }, () => ({}));
}

export function emptyState(practical: Practical): WorkspaceState {
  return {
    rows: emptyRows(practical),
    measurements: {},
    scale: { distance: "", unit: "cm", scale: "" },
    density: { population: "", area: "", unit: "km2" },
    weather: [],
    interpretation: "",
    conclusion: "",
    reflection: "",
  };
}

export { parseRepresentativeFraction };
