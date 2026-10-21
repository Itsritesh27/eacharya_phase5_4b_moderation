import { describe, expect, it } from "vitest";
import { calculatePopulationMetrics, POPULATION_PROFILES } from "./population-data";

describe("population explorer calculations", () => {
  it("calculates population density and growth", () => {
    const metrics = calculatePopulationMetrics(POPULATION_PROFILES[0]!);
    expect(metrics.densityPerKm2).toBe(10_000);
    expect(metrics.growthPercent).toBeCloseTo(18.2266, 3);
    expect(metrics.ageSharesTotal).toBe(100);
  });

  it("all example age groups sum to 100", () => {
    for (const profile of POPULATION_PROFILES) expect(calculatePopulationMetrics(profile).ageSharesTotal).toBe(100);
  });

  it("rejects zero area and invalid age groups", () => {
    expect(() => calculatePopulationMetrics({ ...POPULATION_PROFILES[0]!, areaKm2: 0 })).toThrow();
    expect(() => calculatePopulationMetrics({ ...POPULATION_PROFILES[0]!, age0to14Pct: 90 })).toThrow();
  });
});
