import { describe, expect, it } from "vitest";
import { PRACTICALS, filterPracticals, getPractical, parseGradeParam } from "./catalogue";
import { parseDraft, serializeDraft, draftKey } from "./draft";
import { computeProgress } from "./progress";
import { computedValue, emptyState, reliefSummary } from "./rows";
import { PRACTICAL_GRADES } from "./types";

const long = "x".repeat(40);

describe("catalogue", () => {
  it("has unique ids, covers every class, and every item has the basics", () => {
    const ids = PRACTICALS.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const g of PRACTICAL_GRADES) expect(PRACTICALS.some((p) => p.grade === g)).toBe(true);
    for (const p of PRACTICALS) {
      expect(p.objectives.length).toBeGreaterThan(0);
      expect(p.materials.length).toBeGreaterThan(0);
      expect(p.steps.length).toBeGreaterThan(2);
      expect(p.minutes).toBeGreaterThan(0);
    }
  });
  it("filters by class, difficulty, topic and search", () => {
    expect(filterPracticals({ grade: 12 }).every((p) => p.grade === 12)).toBe(true);
    expect(filterPracticals({ q: "DENSITY" }).length).toBeGreaterThan(0);
    expect(filterPracticals({ q: "zzzz-nothing" })).toHaveLength(0);
    expect(filterPracticals({ difficulty: "Advanced" }).every((p) => p.difficulty === "Advanced")).toBe(true);
  });
  it("parses grade params safely", () => {
    expect(parseGradeParam("11")).toBe(11);
    for (const bad of [undefined, "", "8", "x", "<script>"]) expect(parseGradeParam(bad)).toBeUndefined();
  });
  it("table column keys are unique and computed columns point at real columns", () => {
    for (const p of PRACTICALS) {
      if (!p.table) continue;
      const keys = p.table.columns.map((c) => c.key);
      expect(new Set(keys).size).toBe(keys.length);
      for (const c of p.table.computed ?? []) expect(keys.includes(c.from)).toBe(true);
    }
  });
});

describe("progress", () => {
  it("starts at 0% and reaches 100% only when everything is valid", () => {
    const p = getPractical("g12-population-density")!;
    const s = emptyState(p);
    expect(computeProgress(p, s).percent).toBe(0);
    s.rows = [
      { area_name: "A", population: "1000", area: "10" },
      { area_name: "B", population: "2000", area: "10" },
      { area_name: "C", population: "3000", area: "10" },
    ];
    s.density = { population: "1000", area: "10", unit: "km2" };
    s.interpretation = long; s.conclusion = long; s.reflection = long;
    const full = computeProgress(p, s);
    expect(full.complete).toBe(true);
    expect(full.percent).toBe(100);
    s.rows[1]!.population = "-4";
    expect(computeProgress(p, s).complete).toBe(false);
  });
  it("counts weather days and measurement fields", () => {
    const w = getPractical("g11-weather-rainfall")!;
    const s = emptyState(w);
    expect(computeProgress(w, s).items.find((i) => i.id === "calc-weather")?.done).toBe(false);
    const f = getPractical("g10-local-field-survey")!;
    const fs = emptyState(f);
    fs.measurements = { route: "abc", duration: "30" };
    const items = computeProgress(f, fs).items;
    expect(items.find((i) => i.id === "m-route")?.done).toBe(false);
    expect(items.find((i) => i.id === "m-duration")?.done).toBe(true);
  });
});

describe("computed columns and relief", () => {
  it("computes ground km from the scale", () => {
    expect(computedValue("ground-km", "4", { scale: "1:50,000" })).toBe("2");
    expect(computedValue("ground-km", "4", { scale: "" })).toBeNull();
    expect(computedValue("ground-km", "abc", { scale: "1:50000" })).toBeNull();
  });
  it("computes compass and back bearing", () => {
    expect(computedValue("compass", "90", {})).toBe("E");
    expect(computedValue("back-bearing", "30", {})).toBe("210");
    expect(computedValue("compass", "400", {})).toBeNull();
  });
  it("summarises relief from at least two heights", () => {
    expect(reliefSummary([{ h: "100" }], "h")).toBeNull();
    expect(reliefSummary([{ h: "100" }, { h: "350" }, { h: "x" }], "h")).toEqual({ count: 2, highest: 350, lowest: 100, relief: 250 });
  });
});

describe("local drafts", () => {
  const p = getPractical("g11-weather-rainfall")!;
  it("round-trips a draft", () => {
    const s = emptyState(p);
    s.interpretation = "Warm and dry";
    s.weather = [{ date: "2026-10-01", temperatureC: 30, rainfallMm: 1.5, humidityPct: 50 }];
    const back = parseDraft(serializeDraft(s, new Date("2026-10-17T00:00:00Z")), p);
    expect(back?.state.interpretation).toBe("Warm and dry");
    expect(back?.state.weather).toEqual(s.weather);
    expect(back?.savedAt).toBe("2026-10-17T00:00:00.000Z");
  });
  it("rejects corrupt, wrong-version and oversized drafts and strips unknown or hostile values", () => {
    expect(parseDraft("not json", p)).toBeNull();
    expect(parseDraft(null, p)).toBeNull();
    expect(parseDraft(JSON.stringify({ v: 99, state: {} }), p)).toBeNull();
    expect(parseDraft("x".repeat(600_000), p)).toBeNull();
    const hostile = JSON.stringify({ v: 1, state: { weather: [{ date: "2026-13-45", temperatureC: 1, rainfallMm: 1 }, { date: "2026-10-01", temperatureC: "hot", rainfallMm: 1 }, { date: "2026-10-02", temperatureC: 20, rainfallMm: -5 }], interpretation: 5 } });
    const out = parseDraft(hostile, p);
    expect(out?.state.weather).toHaveLength(0);
    expect(out?.state.interpretation).toBe("");
  });
  it("namespaces keys by user and strips unsafe characters", () => {
    expect(draftKey("g9-x", "abc-123")).not.toBe(draftKey("g9-x", "def-456"));
    expect(draftKey("../../evil", null)).toBe("eacharya:practical-draft:v1:guest:evil");
  });
});
