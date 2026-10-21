import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateBoundaries, type BoundaryCollection } from "./boundaries";
import { buildRegionIndex, detectMatchBy, matchRegion, normaliseName } from "./matching";
import { buildSeries, detectNumericColumns, type Dataset } from "./series";
import { buildStarterDatasets, SAMPLE_CSV_TEXT, STARTER_IDS } from "./starter-datasets";
import { parseCsv } from "./csv";

// The real file served to the browser, so these tests also guard the shipped data.
const geo: BoundaryCollection = validateBoundaries(
  JSON.parse(readFileSync(join(process.cwd(), "public/data/world-countries-110m.geojson"), "utf8")),
);
const index = buildRegionIndex(geo.features);

function dataset(rows: string[][], over: Partial<Dataset> = {}): Dataset {
  return {
    id: "t", title: "t", description: "", origin: "upload", synthetic: false, source: "",
    columns: ["region", "value"], rows, regionColumn: 0, matchBy: "name", latColumn: null, lngColumn: null,
    indicators: [{ column: 1, label: "Value", unit: "" }], ...over,
  };
}
const run = (ds: Dataset) => buildSeries(ds, ds.indicators[0]!, geo.features, index);

describe("boundary file", () => {
  it("is valid, has unique ISO codes and plausible anchors", () => {
    expect(geo.features.length).toBeGreaterThan(150);
    const iso3 = geo.features.map((f) => f.properties.iso3);
    expect(new Set(iso3).size).toBe(iso3.length);
    const india = geo.features.find((f) => f.properties.iso3 === "IND")!.properties;
    expect(india.alat).toBeGreaterThan(8);
    expect(india.alat).toBeLessThan(37);
    expect(india.alng).toBeGreaterThan(68);
    expect(india.alng).toBeLessThan(98);
  });
  it("rejects malformed boundary data", () => {
    expect(() => validateBoundaries(null)).toThrow();
    expect(() => validateBoundaries({ type: "FeatureCollection", features: [] })).toThrow();
    expect(() => validateBoundaries({ type: "FeatureCollection", features: [{ type: "Feature", properties: {}, geometry: null }] })).toThrow();
  });
});

describe("matching", () => {
  it("normalises accents, punctuation and case", () => {
    expect(normaliseName("Côte d’Ivoire")).toBe(normaliseName("cote d'ivoire"));
    expect(normaliseName("  The Gambia ")).toBe("gambia");
    expect(normaliseName("Bosnia & Herz.")).toBe("bosnia and herz");
  });
  it("matches names, common aliases, ISO3 and ISO2", () => {
    const iso3 = (n: string) => geo.features[matchRegion(index, n, "name")!]!.properties.iso3;
    expect(iso3("India")).toBe("IND");
    expect(iso3("united states")).toBe("USA");
    expect(iso3("USA")).toBe("USA");
    expect(iso3("Russian Federation")).toBe("RUS");
    expect(iso3("Korea, South")).toBe("KOR");
    expect(iso3("Democratic Republic of the Congo")).toBe("COD");
    expect(iso3("Republic of the Congo")).toBe("COG");
    expect(iso3("Congo")).toBe("COG");
    expect(iso3("Ivory Coast")).toBe("CIV");
    expect(iso3("Czech Republic")).toBe("CZE");
    expect(iso3("Bosnia and Herzegovina")).toBe("BIH");
    expect(geo.features[matchRegion(index, "ind", "iso3")!]!.properties.name).toBe("India");
    expect(geo.features[matchRegion(index, "in", "iso2")!]!.properties.name).toBe("India");
    expect(geo.features[matchRegion(index, "XK", "iso2")!]!.properties.name).toBe("Kosovo");
  });
  it("does not match unknown or blank values, or a name used as a code", () => {
    expect(matchRegion(index, "Atlantis", "name")).toBeNull();
    expect(matchRegion(index, "", "name")).toBeNull();
    expect(matchRegion(index, "India", "iso3")).toBeNull();
    expect(matchRegion(index, "IND", "name")).toBeNull();
  });
  it("detects the best matching strategy", () => {
    expect(detectMatchBy(index, ["India", "China", "Brazil"]).by).toBe("name");
    expect(detectMatchBy(index, ["IND", "CHN", "BRA"]).by).toBe("iso3");
    expect(detectMatchBy(index, ["IN", "CN", "BR"]).by).toBe("iso2");
    expect(detectMatchBy(index, ["zzz", "qqq"]).rate).toBe(0);
    expect(detectMatchBy(index, []).rate).toBe(0);
  });
});

describe("starter datasets", () => {
  const starters = buildStarterDatasets(geo.features);
  it("exist, are labelled, and the synthetic one is flagged", () => {
    expect(starters.map((d) => d.id)).toEqual([STARTER_IDS.population, STARTER_IDS.practice]);
    expect(starters.find((d) => d.id === STARTER_IDS.practice)!.synthetic).toBe(true);
    expect(starters.find((d) => d.id === STARTER_IDS.practice)!.title).toMatch(/SYNTHETIC/);
    expect(starters.find((d) => d.id === STARTER_IDS.population)!.synthetic).toBe(false);
    for (const d of starters) expect(d.source.length).toBeGreaterThan(20);
  });
  it("every starter row matches exactly one boundary feature and no row is lost", () => {
    for (const d of starters) {
      const s = run(d);
      expect(s.counts.unmatched).toBe(0);
      expect(s.counts.invalid + s.counts.missing + s.counts.duplicate).toBe(0);
      expect(s.regionRecords.length).toBe(d.rows.length);
    }
    const pop = run(starters[0]!);
    expect(pop.regionRecords.length).toBe(geo.features.length);
    expect(pop.featuresWithoutData).toEqual([]);
  });
  it("population values equal the boundary file's own figures", () => {
    const s = run(starters[0]!);
    const r = s.regionRecords.find((x) => x.label === "India")!;
    expect(r.value).toBe(geo.features[r.featureIndex!]!.properties.pop);
  });
  it("the practice set leaves most regions visibly without data", () => {
    const s = run(starters[1]!);
    expect(s.featuresWithoutData.length).toBe(geo.features.length - s.regionRecords.length);
    expect(s.featuresWithoutData.length).toBeGreaterThan(100);
  });
});

describe("buildSeries validation", () => {
  it("separates valid, missing, non-numeric, duplicate and unmatched rows", () => {
    const s = run(dataset([
      ["India", "10"], ["China", ""], ["Brazil", "abc"], ["India", "99"], ["United States", "5"], ["USA", "7"],
      ["Atlantis", "3"], ["Kenya", "12%"], ["Peru", "1,200"],
    ]));
    expect(s.counts).toMatchObject({ rows: 9, valid: 4, missing: 1, invalid: 2, duplicate: 2, unmatched: 1 });
    expect(s.records[3]!.status).toBe("duplicate"); // second India
    expect(s.records[5]!.status).toBe("duplicate"); // USA repeats United States via a different spelling
    expect(s.records[2]!.detail).toMatch(/not a number/);
    expect(s.records[7]!.detail).toMatch(/% sign/);
    expect(s.regionRecords.map((r) => r.value).sort((a, b) => a! - b!)).toEqual([5, 10, 1200]);
    expect(s.pointRecords).toHaveLength(3); // Atlantis has no position
    expect(s.allValues.sort((a, b) => a - b)).toEqual([3, 5, 10, 1200]);
  });
  it("first row wins for a region and the first value is the one mapped", () => {
    const s = run(dataset([["India", "1"], ["India", "2"]]));
    expect(s.regionRecords).toHaveLength(1);
    expect(s.regionRecords[0]!.value).toBe(1);
  });
  it("treats negative values as valid numbers (symbol limits are applied by the map)", () => {
    const s = run(dataset([["India", "-5"], ["China", "5"]]));
    expect(s.counts.valid).toBe(2);
  });
  it("works without a region column using latitude and longitude, and flags bad coordinates", () => {
    const ds = dataset(
      [["Alpha", "10", "28.6", "77.2"], ["Beta", "20", "95", "10"], ["Gamma", "30", "", "10"], ["Delta", "40", "-33.9", "151.2"], ["Alpha", "10", "28.6", "77.2"]],
      { columns: ["place", "value", "lat", "lng"], regionColumn: null, matchBy: null, latColumn: 2, lngColumn: 3 },
    );
    const s = run(ds);
    expect(s.counts.valid).toBe(4); // exact repeat of Alpha (same place and coordinates) is a duplicate
    expect(s.counts.duplicate).toBe(1);
    expect(s.counts.badCoords).toBe(2);
    expect(s.pointRecords.map((r) => r.label)).toEqual(["Alpha", "Delta"]);
    expect(s.regionRecords).toHaveLength(0);
    expect(s.pointRecords[0]!.positionSource).toBe("columns");
  });
  it("labels rows from the first text column when there is no region column", () => {
    const ds = dataset([["Pune", "5", "18.5", "73.8"]], { columns: ["city", "v", "lat", "lng"], regionColumn: null, matchBy: null, latColumn: 2, lngColumn: 3 });
    expect(run(ds).records[0]!.label).toBe("Pune");
  });
  it("uses region anchors for symbols when matched and no coordinate columns exist", () => {
    const s = run(dataset([["India", "10"]]));
    const p = s.pointRecords[0]!;
    expect(p.positionSource).toBe("region");
    expect(p.lat).toBe(geo.features[p.featureIndex!]!.properties.alat);
  });
  it("copes with no index (boundaries not loaded): nothing is matched, nothing crashes", () => {
    const ds = dataset([["India", "10"]]);
    const s = buildSeries(ds, ds.indicators[0]!, [], null);
    expect(s.regionRecords).toHaveLength(0);
    expect(s.counts.valid).toBe(1);
  });
  it("handles a one-row dataset and an all-invalid dataset", () => {
    expect(run(dataset([["India", "1"]])).allValues).toEqual([1]);
    const bad = run(dataset([["India", "x"], ["China", ""]]));
    expect(bad.allValues).toEqual([]);
    expect(bad.counts.valid).toBe(0);
  });
});

describe("sample CSV and numeric column detection", () => {
  it("the sample CSV parses and its numeric columns are detected", () => {
    const r = parseCsv(SAMPLE_CSV_TEXT);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.headers).toEqual(["place", "country", "latitude", "longitude", "practice_value"]);
    expect(r.data.rows.length).toBe(6);
    expect(detectNumericColumns(r.data.headers, r.data.rows, new Set([2, 3]))).toEqual([4]);
    // every sample country name must match a boundary
    for (const row of r.data.rows) expect(matchRegion(index, row[1]!, "name")).not.toBeNull();
  });
  it("ignores mostly-text columns", () => {
    expect(detectNumericColumns(["a", "b"], [["x", "1"], ["y", "z"], ["w", "q"]], new Set())).toEqual([]);
    expect(detectNumericColumns(["a", "b"], [["1", "1"], ["2", ""], ["x", "3"]], new Set([1]))).toEqual([0]);
  });
});
