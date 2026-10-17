/** Student weather log: validation and summaries. These are student observations, not official data. */
import { parseCellNumber } from "@/lib/thematic/numbers";
import { tidy, type Parsed } from "./scale";

export interface WeatherObservation {
  date: string; // YYYY-MM-DD
  temperatureC: number;
  rainfallMm: number;
  humidityPct?: number;
}

export interface WeatherInput {
  date: string;
  temperature: string;
  rainfall: string;
  humidity: string;
}

export const TEMP_MIN = -90;
export const TEMP_MAX = 60;
export const RAIN_MAX_MM = 2000;
export const MAX_OBSERVATIONS = 366;

/** Local calendar date as YYYY-MM-DD (not UTC, so a student's "today" is their today). */
export function todayIso(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function isValidIsoDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return y >= 1900 && dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export function validateObservation(
  input: WeatherInput,
  existing: readonly WeatherObservation[],
  today: string = todayIso(),
): Parsed<WeatherObservation> {
  if (existing.length >= MAX_OBSERVATIONS) return { ok: false, error: `A log can hold at most ${MAX_OBSERVATIONS} observations.` };
  const date = input.date.trim();
  if (!isValidIsoDate(date)) return { ok: false, error: "Enter a valid date." };
  if (date > today) return { ok: false, error: "The date cannot be in the future: record what you actually observed." };
  if (existing.some((o) => o.date === date)) return { ok: false, error: "There is already an observation for that date. Remove it first to replace it." };

  const t = parseCellNumber(input.temperature);
  if (t.kind === "missing") return { ok: false, error: "Enter the temperature in °C." };
  if (t.kind === "invalid") return { ok: false, error: `Temperature must be a number (${t.reason}).` };
  if (t.value < TEMP_MIN || t.value > TEMP_MAX) return { ok: false, error: `Temperature must be between ${TEMP_MIN} and ${TEMP_MAX} °C.` };

  const r = parseCellNumber(input.rainfall);
  if (r.kind === "missing") return { ok: false, error: "Enter the rainfall in mm (use 0 if it did not rain)." };
  if (r.kind === "invalid") return { ok: false, error: `Rainfall must be a number (${r.reason}).` };
  if (r.value < 0 || r.value > RAIN_MAX_MM) return { ok: false, error: `Rainfall must be between 0 and ${RAIN_MAX_MM} mm.` };

  const obs: WeatherObservation = { date, temperatureC: t.value, rainfallMm: r.value };
  const h = parseCellNumber(input.humidity);
  if (h.kind === "invalid") return { ok: false, error: `Humidity must be a number (${h.reason}).` };
  if (h.kind === "number") {
    if (h.value < 0 || h.value > 100) return { ok: false, error: "Humidity must be between 0 and 100 %." };
    obs.humidityPct = h.value;
  }
  return { ok: true, value: obs };
}

export interface WeatherSummary {
  count: number;
  averageTemperatureC: number;
  minTemperatureC: number;
  maxTemperatureC: number;
  totalRainfallMm: number;
  rainyDays: number;
  wettest: { date: string; rainfallMm: number } | null;
  averageHumidityPct: number | null;
  humidityCount: number;
}

/** Returns null for an empty log: no summary is invented. */
export function summarise(observations: readonly WeatherObservation[]): WeatherSummary | null {
  if (observations.length === 0) return null;
  const temps = observations.map((o) => o.temperatureC);
  const rains = observations.map((o) => o.rainfallMm);
  const hum = observations.flatMap((o) => (o.humidityPct === undefined ? [] : [o.humidityPct]));
  let wettest: WeatherSummary["wettest"] = null;
  for (const o of observations) {
    if (o.rainfallMm > 0 && (!wettest || o.rainfallMm > wettest.rainfallMm)) wettest = { date: o.date, rainfallMm: o.rainfallMm };
  }
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  return {
    count: observations.length,
    averageTemperatureC: tidy(sum(temps) / temps.length, 2),
    minTemperatureC: Math.min(...temps),
    maxTemperatureC: Math.max(...temps),
    totalRainfallMm: tidy(sum(rains), 2),
    rainyDays: rains.filter((r) => r > 0).length,
    wettest,
    averageHumidityPct: hum.length ? tidy(sum(hum) / hum.length, 1) : null,
    humidityCount: hum.length,
  };
}

export function sortByDate(observations: readonly WeatherObservation[]): WeatherObservation[] {
  return [...observations].sort((a, b) => a.date.localeCompare(b.date));
}
