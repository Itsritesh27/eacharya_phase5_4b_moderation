/**
 * Device-only drafts. A draft lives in this browser's localStorage and is NOT saved to the server,
 * NOT submitted, and NOT visible to a teacher. Parsing treats stored text as untrusted and rebuilds a
 * clean WorkspaceState from known keys only.
 */
import { MAX_OBSERVATIONS, isValidIsoDate, type WeatherObservation } from "./weather";
import { CELL_LIMIT, TEXT_LIMIT, type Practical, type WorkspaceState } from "./types";
import { emptyState } from "./rows";

export const DRAFT_VERSION = 1;
export const DRAFT_PREFIX = "eacharya:practical-draft:v1";

/** Key is namespaced by user so one signed-in student cannot see another's draft on a shared computer. */
export function draftKey(activityId: string, userId: string | null): string {
  const safeId = activityId.replace(/[^a-z0-9-]/gi, "");
  const safeUser = userId ? userId.replace(/[^a-z0-9-]/gi, "") : "guest";
  return `${DRAFT_PREFIX}:${safeUser}:${safeId}`;
}

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function serializeDraft(state: WorkspaceState, now: Date = new Date()): string {
  return JSON.stringify({ v: DRAFT_VERSION, savedAt: now.toISOString(), state });
}

export function parseDraft(json: string | null, practical: Practical): { state: WorkspaceState; savedAt: string | null } | null {
  if (!json || json.length > 500_000) return null;
  let raw: unknown;
  try { raw = JSON.parse(json); } catch { return null; }
  if (!isObj(raw) || raw.v !== DRAFT_VERSION || !isObj(raw.state)) return null;
  const s = raw.state;
  const base = emptyState(practical);

  const maxRows = practical.table?.maxRows ?? 0;
  const rows: Record<string, string>[] = [];
  if (Array.isArray(s.rows) && practical.table) {
    for (const r of s.rows.slice(0, maxRows)) {
      const row: Record<string, string> = {};
      if (isObj(r)) for (const c of practical.table.columns) row[c.key] = str(r[c.key], CELL_LIMIT);
      rows.push(row);
    }
  }
  while (rows.length < (practical.table?.minRows ?? 0)) rows.push({});

  const measurements: Record<string, string> = {};
  if (isObj(s.measurements)) for (const f of practical.measurements) measurements[f.key] = str(s.measurements[f.key], 40);

  const sc = isObj(s.scale) ? s.scale : {};
  const de = isObj(s.density) ? s.density : {};
  const weather: WeatherObservation[] = [];
  if (Array.isArray(s.weather)) {
    for (const o of s.weather.slice(0, MAX_OBSERVATIONS)) {
      if (!isObj(o) || typeof o.date !== "string" || !isValidIsoDate(o.date)) continue;
      if (typeof o.temperatureC !== "number" || !Number.isFinite(o.temperatureC)) continue;
      if (typeof o.rainfallMm !== "number" || !Number.isFinite(o.rainfallMm) || o.rainfallMm < 0) continue;
      const obs: WeatherObservation = { date: o.date, temperatureC: o.temperatureC, rainfallMm: o.rainfallMm };
      if (typeof o.humidityPct === "number" && Number.isFinite(o.humidityPct) && o.humidityPct >= 0 && o.humidityPct <= 100) obs.humidityPct = o.humidityPct;
      if (!weather.some((w) => w.date === obs.date)) weather.push(obs);
    }
  }

  return {
    savedAt: typeof raw.savedAt === "string" ? raw.savedAt.slice(0, 40) : null,
    state: {
      ...base,
      rows,
      measurements,
      scale: { distance: str(sc.distance, 40), unit: ["mm", "cm", "m"].includes(str(sc.unit, 4)) ? str(sc.unit, 4) : "cm", scale: str(sc.scale, 40) },
      density: { population: str(de.population, 40), area: str(de.area, 40), unit: str(de.unit, 4) === "ha" ? "ha" : "km2" },
      weather,
      interpretation: str(s.interpretation, TEXT_LIMIT),
      conclusion: str(s.conclusion, TEXT_LIMIT),
      reflection: str(s.reflection, TEXT_LIMIT),
    },
  };
}
