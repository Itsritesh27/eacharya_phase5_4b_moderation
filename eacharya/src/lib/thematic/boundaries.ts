/**
 * Boundary data: Natural Earth 1:110m Admin 0 countries (public domain), served from
 * /data/world-countries-110m.geojson. See public/data/world-countries-110m.ATTRIBUTION.txt.
 */
export const BOUNDARY_URL = "/data/world-countries-110m.geojson";
export const BOUNDARY_ATTRIBUTION = "Boundaries: Natural Earth 1:110m (public domain)";
export const BOUNDARY_DISCLAIMER =
  "Country boundaries are Natural Earth 1:110m, generalised for small scales. They show de facto boundaries, may differ from boundaries officially recognised by any government, and some small countries are not included. For study only, not for navigation or official use.";

export interface RegionProps {
  name: string;
  nameLong: string;
  admin: string;
  formal: string | null;
  brk: string | null;
  iso3: string | null;
  iso2: string | null;
  continent: string;
  /** Natural Earth POP_EST: an estimate, not an official statistic. */
  pop: number;
  popYear: number;
  /** Approximate symbol anchor derived from the region's own geometry (centroid of its largest polygon). */
  alat: number;
  alng: number;
}

export interface BoundaryFeature {
  type: "Feature";
  properties: RegionProps;
  geometry: { type: "Polygon" | "MultiPolygon"; coordinates: unknown };
}
export interface BoundaryCollection {
  type: "FeatureCollection";
  features: BoundaryFeature[];
}

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStrOrNull = (v: unknown): v is string | null => v === null || typeof v === "string";

/** Runtime check so a corrupted or wrong file produces a clear error instead of a broken map. */
export function validateBoundaries(data: unknown): BoundaryCollection {
  const fc = data as { type?: unknown; features?: unknown };
  if (!fc || fc.type !== "FeatureCollection" || !Array.isArray(fc.features) || fc.features.length === 0) {
    throw new Error("The boundary file is not a valid GeoJSON FeatureCollection.");
  }
  for (const f of fc.features as Array<Record<string, unknown>>) {
    const p = f?.properties as Record<string, unknown> | undefined;
    const g = f?.geometry as { type?: unknown; coordinates?: unknown } | undefined;
    const geomOk = !!g && (g.type === "Polygon" || g.type === "MultiPolygon") && Array.isArray(g.coordinates);
    const propsOk =
      !!p && isStr(p.name) && isStr(p.nameLong) && isStr(p.admin) && isStrOrNull(p.formal) && isStrOrNull(p.brk) &&
      isStrOrNull(p.iso3) && isStrOrNull(p.iso2) && isStr(p.continent) && isNum(p.pop) && isNum(p.popYear) &&
      isNum(p.alat) && isNum(p.alng);
    if (!geomOk || !propsOk) throw new Error("The boundary file has an unexpected structure.");
  }
  return data as BoundaryCollection;
}

export async function loadBoundaries(signal?: AbortSignal): Promise<BoundaryCollection> {
  const res = await fetch(BOUNDARY_URL, { signal, credentials: "same-origin" });
  if (!res.ok) throw new Error(`The boundary file could not be loaded (status ${res.status}).`);
  return validateBoundaries(await res.json());
}
