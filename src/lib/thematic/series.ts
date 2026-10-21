import type { BoundaryFeature } from "./boundaries";
import { matchRegion, normaliseName, type MatchBy, type RegionIndex } from "./matching";
import { parseCellNumber } from "./numbers";

export interface IndicatorDef {
  /** Index of the column in `rows`. */
  column: number;
  label: string;
  /** Unit shown next to values, supplied by the dataset or the person importing it (may be empty). */
  unit: string;
}

export interface Dataset {
  id: string;
  title: string;
  description: string;
  origin: "starter" | "upload";
  /** True for illustrative practice data. Always shown with a prominent warning. */
  synthetic: boolean;
  /** Where the numbers come from (attribution) or why there is none. */
  source: string;
  columns: string[];
  rows: string[][];
  regionColumn: number | null;
  matchBy: MatchBy | null;
  latColumn: number | null;
  lngColumn: number | null;
  indicators: IndicatorDef[];
}

export type RecordStatus = "ok" | "missing" | "invalid" | "duplicate";

export interface SeriesRecord {
  /** Index into dataset.rows. */
  rowIndex: number;
  label: string;
  raw: string;
  value: number | null;
  status: RecordStatus;
  detail: string | null;
  /** "none" when the dataset has no region column. */
  region: "matched" | "unmatched" | "none";
  featureIndex: number | null;
  coord: "ok" | "bad" | "none";
  /** Position used for proportional symbols. */
  lat: number | null;
  lng: number | null;
  positionSource: "columns" | "region" | null;
}

export interface Series {
  indicator: IndicatorDef;
  records: SeriesRecord[];
  counts: { rows: number; valid: number; missing: number; invalid: number; duplicate: number; unmatched: number; badCoords: number };
  /** Valid values with a matched boundary, first row per region. Drives choropleth and graduated maps. */
  regionRecords: SeriesRecord[];
  /** Valid values with a usable position. Drives proportional symbols. */
  pointRecords: SeriesRecord[];
  /** Valid rows beyond the first for a region that was already shaded. */
  extraRowsForRegion: number;
  /** Boundary features that received no value. */
  featuresWithoutData: number[];
  /** The numbers behind the map, for legend and classification. */
  allValues: number[];
}

function parseCoord(raw: string, kind: "lat" | "lng"): number | null {
  const n = parseCellNumber(raw);
  if (n.kind !== "number") return null;
  const lim = kind === "lat" ? 90 : 180;
  return Math.abs(n.value) <= lim ? n.value : null;
}

/** Pick a human label column: the region column, else the first mostly non-numeric column that is not the indicator. */
function labelColumnFor(ds: Dataset, indicatorColumn: number): number | null {
  if (ds.regionColumn !== null) return ds.regionColumn;
  const skip = new Set([indicatorColumn, ds.latColumn, ds.lngColumn]);
  for (let c = 0; c < ds.columns.length; c++) {
    if (skip.has(c)) continue;
    const vals = ds.rows.slice(0, 50).map((r) => r[c] ?? "").filter((v) => v.trim() !== "");
    if (vals.length && vals.filter((v) => parseCellNumber(v).kind !== "number").length / vals.length > 0.5) return c;
  }
  return null;
}

export function buildSeries(
  ds: Dataset,
  indicator: IndicatorDef,
  features: readonly BoundaryFeature[],
  index: RegionIndex | null,
): Series {
  const labelCol = labelColumnFor(ds, indicator.column);
  const seen = new Set<string>();
  const regionUsed = new Set<number>();
  const records: SeriesRecord[] = [];
  const counts = { rows: ds.rows.length, valid: 0, missing: 0, invalid: 0, duplicate: 0, unmatched: 0, badCoords: 0 };
  const regionRecords: SeriesRecord[] = [];
  const pointRecords: SeriesRecord[] = [];
  let extraRowsForRegion = 0;
  const hasCoords = ds.latColumn !== null && ds.lngColumn !== null;

  ds.rows.forEach((row, rowIndex) => {
    const raw = row[indicator.column] ?? "";
    const labelRaw = labelCol !== null ? (row[labelCol] ?? "").trim() : "";
    const label = labelRaw || `Row ${rowIndex + 1}`;
    const num = parseCellNumber(raw);

    let featureIndex: number | null = null;
    let region: SeriesRecord["region"] = "none";
    if (ds.regionColumn !== null && ds.matchBy && index) {
      featureIndex = matchRegion(index, row[ds.regionColumn] ?? "", ds.matchBy);
      region = featureIndex === null ? "unmatched" : "matched";
    }

    let lat: number | null = null;
    let lng: number | null = null;
    let coord: SeriesRecord["coord"] = "none";
    let positionSource: SeriesRecord["positionSource"] = null;
    if (hasCoords) {
      lat = parseCoord(row[ds.latColumn!] ?? "", "lat");
      lng = parseCoord(row[ds.lngColumn!] ?? "", "lng");
      if (lat !== null && lng !== null) { coord = "ok"; positionSource = "columns"; }
      else { coord = "bad"; lat = null; lng = null; }
    } else if (featureIndex !== null) {
      const p = features[featureIndex]!.properties;
      lat = p.alat; lng = p.alng; positionSource = "region";
    }

    let status: RecordStatus = "ok";
    let detail: string | null = null;
    let value: number | null = null;
    if (num.kind === "missing") { status = "missing"; detail = "No value"; counts.missing++; }
    else if (num.kind === "invalid") { status = "invalid"; detail = `"${raw.trim().slice(0, 30)}": ${num.reason}`; counts.invalid++; }
    else {
      value = num.value;
      const key = hasCoords
        ? `${normaliseName(labelRaw)}|${lat}|${lng}`
        : featureIndex !== null ? `f:${featureIndex}` : labelRaw ? `u:${normaliseName(labelRaw)}` : `r:${rowIndex}`;
      if (seen.has(key)) { status = "duplicate"; detail = "Repeats an earlier row"; counts.duplicate++; value = null; }
      else seen.add(key);
    }

    const rec: SeriesRecord = { rowIndex, label, raw, value, status, detail, region, featureIndex, coord, lat, lng, positionSource };
    records.push(rec);
    if (status !== "ok" || value === null) return;

    counts.valid++;
    if (ds.regionColumn !== null && region === "unmatched") counts.unmatched++;
    if (hasCoords && coord === "bad") counts.badCoords++;
    if (featureIndex !== null) {
      if (regionUsed.has(featureIndex)) extraRowsForRegion++;
      else { regionUsed.add(featureIndex); regionRecords.push(rec); }
    }
    if (lat !== null && lng !== null) pointRecords.push(rec);
  });

  const featuresWithoutData: number[] = [];
  features.forEach((_, i) => { if (!regionUsed.has(i)) featuresWithoutData.push(i); });
  const allValues = records.filter((r) => r.status === "ok" && r.value !== null).map((r) => r.value as number);
  return { indicator, records, counts, regionRecords, pointRecords, extraRowsForRegion, featuresWithoutData, allValues };
}

/** Columns that look like indicators: at least one number, and at least half of their filled cells numeric. */
export function detectNumericColumns(headers: readonly string[], rows: readonly string[][], exclude: ReadonlySet<number>): number[] {
  const out: number[] = [];
  for (let c = 0; c < headers.length; c++) {
    if (exclude.has(c)) continue;
    let filled = 0, numeric = 0;
    for (const r of rows) {
      const v = (r[c] ?? "").trim();
      if (v === "") continue;
      filled++;
      if (parseCellNumber(v).kind === "number") numeric++;
    }
    if (numeric > 0 && numeric / filled >= 0.5) out.push(c);
  }
  return out;
}
