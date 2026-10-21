import { describe, expect, it } from "vitest";
import { INDIA_GEOGRAPHY_DATASETS } from "./india-datasets";

describe("India geography dataset library", () => {
  it("has unique dataset IDs, source links and at least one record per dataset", () => {
    const ids = INDIA_GEOGRAPHY_DATASETS.map((dataset) => dataset.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const dataset of INDIA_GEOGRAPHY_DATASETS) {
      expect(dataset.title.trim()).not.toBe("");
      expect(dataset.rows.length).toBeGreaterThan(0);
      expect(dataset.sourceLabel.trim()).not.toBe("");
      expect(dataset.sourceUrl).toMatch(/^https:\/\//);
      expect(dataset.caveat.trim()).not.toBe("");
    }
  });

  it("contains a record value for every declared table column", () => {
    for (const dataset of INDIA_GEOGRAPHY_DATASETS) {
      for (const row of dataset.rows) {
        for (const column of dataset.columns) {
          expect(row).toHaveProperty(column.key);
        }
      }
    }
  });

  it("contains plausible Census literacy percentages and calculated gender gaps", () => {
    const dataset = INDIA_GEOGRAPHY_DATASETS.find((item) => item.id === "literacy-sex-2011");
    expect(dataset).toBeDefined();
    for (const row of dataset!.rows) {
      for (const key of ["male_literacy_pct", "female_literacy_pct", "total_literacy_pct", "male_female_gap_pp"]) {
        const value = row[key];
        expect(typeof value).toBe("number");
        expect(value as number).toBeGreaterThanOrEqual(0);
        expect(value as number).toBeLessThanOrEqual(100);
      }
      expect(row.male_female_gap_pp).toBeCloseTo((row.male_literacy_pct as number) - (row.female_literacy_pct as number), 1);
    }
  });

  it("has 12 valid monthly rainfall values and a matching derived sum", () => {
    const dataset = INDIA_GEOGRAPHY_DATASETS.find((item) => item.id === "rainfall-imd-2023");
    expect(dataset).toBeDefined();
    const months = ["jan_mm", "feb_mm", "mar_mm", "apr_mm", "may_mm", "jun_mm", "jul_mm", "aug_mm", "sep_mm", "oct_mm", "nov_mm", "dec_mm"];
    for (const row of dataset!.rows) {
      const monthly = months.map((key) => row[key] as number);
      expect(monthly).toHaveLength(12);
      expect(monthly.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
      expect(row.annual_total_mm).toBeCloseTo(monthly.reduce((sum, value) => sum + value, 0), 1);
    }
  });

  it("does not report surfaced roads longer than total length", () => {
    const dataset = INDIA_GEOGRAPHY_DATASETS.find((item) => item.id === "road-length");
    expect(dataset).toBeDefined();
    for (const row of dataset!.rows) {
      expect(row.surfaced_road_length_km as number).toBeLessThanOrEqual(row.total_road_length_km as number);
      expect(row.unsurfaced_road_length_km).toBe((row.total_road_length_km as number) - (row.surfaced_road_length_km as number));
    }
  });
});
