import { describe, expect, it } from "vitest";
import { isValidIsoDate, summarise, validateObservation, type WeatherObservation } from "./weather";

const TODAY = "2026-10-17";
const input = (o: Partial<Record<"date" | "temperature" | "rainfall" | "humidity", string>> = {}) => ({
  date: "2026-10-10", temperature: "28.5", rainfall: "0", humidity: "", ...o,
});

describe("validateObservation", () => {
  it("accepts a valid observation with optional humidity", () => {
    const r = validateObservation(input({ humidity: "65" }), [], TODAY);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toEqual({ date: "2026-10-10", temperatureC: 28.5, rainfallMm: 0, humidityPct: 65 });
  });
  it("leaves humidity out when blank", () => {
    const r = validateObservation(input(), [], TODAY);
    expect(r.ok && r.value.humidityPct === undefined).toBe(true);
  });
  it("rejects future, impossible and duplicate dates", () => {
    expect(validateObservation(input({ date: "2026-10-18" }), [], TODAY).ok).toBe(false);
    expect(validateObservation(input({ date: "2026-02-30" }), [], TODAY).ok).toBe(false);
    expect(validateObservation(input({ date: "" }), [], TODAY).ok).toBe(false);
    const existing: WeatherObservation[] = [{ date: "2026-10-10", temperatureC: 20, rainfallMm: 0 }];
    expect(validateObservation(input(), existing, TODAY).ok).toBe(false);
  });
  it("rejects bad numbers", () => {
    expect(validateObservation(input({ temperature: "hot" }), [], TODAY).ok).toBe(false);
    expect(validateObservation(input({ temperature: "75" }), [], TODAY).ok).toBe(false);
    expect(validateObservation(input({ temperature: "" }), [], TODAY).ok).toBe(false);
    expect(validateObservation(input({ rainfall: "-1" }), [], TODAY).ok).toBe(false);
    expect(validateObservation(input({ rainfall: "" }), [], TODAY).ok).toBe(false);
    expect(validateObservation(input({ rainfall: "5000" }), [], TODAY).ok).toBe(false);
    expect(validateObservation(input({ humidity: "120" }), [], TODAY).ok).toBe(false);
    expect(validateObservation(input({ humidity: "wet" }), [], TODAY).ok).toBe(false);
  });
  it("validates ISO dates", () => {
    expect(isValidIsoDate("2024-02-29")).toBe(true);
    expect(isValidIsoDate("2026-02-29")).toBe(false);
    expect(isValidIsoDate("10/10/2026")).toBe(false);
  });
});

describe("summarise", () => {
  it("returns null for an empty log", () => {
    expect(summarise([])).toBeNull();
  });
  it("computes average, extremes, total rainfall, wettest day", () => {
    const s = summarise([
      { date: "2026-10-01", temperatureC: 30, rainfallMm: 0, humidityPct: 60 },
      { date: "2026-10-02", temperatureC: 26, rainfallMm: 12.5 },
      { date: "2026-10-03", temperatureC: 28, rainfallMm: 7.3, humidityPct: 80 },
    ]);
    expect(s).not.toBeNull();
    if (s) {
      expect(s.count).toBe(3);
      expect(s.averageTemperatureC).toBe(28);
      expect(s.minTemperatureC).toBe(26);
      expect(s.maxTemperatureC).toBe(30);
      expect(s.totalRainfallMm).toBe(19.8);
      expect(s.rainyDays).toBe(2);
      expect(s.wettest).toEqual({ date: "2026-10-02", rainfallMm: 12.5 });
      expect(s.averageHumidityPct).toBe(70);
      expect(s.humidityCount).toBe(2);
    }
  });
  it("has no wettest day and null humidity when dry and unrecorded", () => {
    const s = summarise([{ date: "2026-10-01", temperatureC: 30, rainfallMm: 0 }]);
    expect(s?.wettest).toBeNull();
    expect(s?.averageHumidityPct).toBeNull();
  });
});
