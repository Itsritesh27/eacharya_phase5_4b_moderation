import { describe, expect, it } from "vitest";
import { CLIMATE_PROFILES, summariseClimate } from "./climate-data";

describe("climate teaching profiles", () => {
  it("provides a full 12-month series for every example", () => {
    for (const profile of CLIMATE_PROFILES) {
      expect(profile.temperatureC).toHaveLength(12);
      expect(profile.rainfallMm).toHaveLength(12);
      expect(profile.rainfallMm.every((value) => value >= 0)).toBe(true);
    }
  });

  it("summarises annual rainfall and warm/wet months", () => {
    const summary = summariseClimate(CLIMATE_PROFILES.find((p) => p.id === "monsoon")!);
    expect(summary.annualRainfallMm).toBe(1272);
    expect(summary.wettestMonth).toBe("Jul");
    expect(summary.warmestMonth).toBe("May");
    expect(summary.coolestMonth).toBe("Jan");
  });

  it("rejects malformed monthly data", () => {
    expect(() => summariseClimate({ ...CLIMATE_PROFILES[0]!, rainfallMm: [1, 2] })).toThrow();
  });
});
