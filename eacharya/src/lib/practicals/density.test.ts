import { describe, expect, it } from "vitest";
import { populationDensity } from "./density";

describe("populationDensity", () => {
  it("divides population by area in km²", () => {
    const r = populationDensity("1,000,000", "500", "km2");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.density).toBe(2000);
      expect(r.value.formula).toMatch(/population ÷ area/i);
    }
  });
  it("converts hectares", () => {
    const r = populationDensity("5000", "200", "ha");
    expect(r.ok && Math.abs(r.value.areaKm2 - 2) < 1e-9 && r.value.density === 2500).toBe(true);
  });
  it("allows zero population", () => {
    const r = populationDensity("0", "10", "km2");
    expect(r.ok && r.value.density === 0).toBe(true);
  });
  it("rejects division by zero, negatives, decimals of people, text", () => {
    expect(populationDensity("100", "0", "km2").ok).toBe(false);
    expect(populationDensity("100", "-5", "km2").ok).toBe(false);
    expect(populationDensity("-100", "5", "km2").ok).toBe(false);
    expect(populationDensity("10.5", "5", "km2").ok).toBe(false);
    expect(populationDensity("many", "5", "km2").ok).toBe(false);
    expect(populationDensity("100", "five", "km2").ok).toBe(false);
    expect(populationDensity("", "5", "km2").ok).toBe(false);
    expect(populationDensity("100", "", "km2").ok).toBe(false);
    expect(populationDensity("100", "5", "acres").ok).toBe(false);
    expect(populationDensity("99999999999999", "5", "km2").ok).toBe(false);
    expect(populationDensity("100", "1e12", "km2").ok).toBe(false);
  });
});
