import { describe, expect, it } from "vitest";
import { classIndex, classify, decimalsForBreaks, jenksBreaks, NATURAL_BREAKS_MAX_VALUES, type Classification } from "./classify";
import { classLabels, legendSymbolValues, roundDownSig, symbolRadius } from "./legend";
import { classColours, getRamp, RAMPS, sampleRamp } from "./ramps";

function ok(values: number[], m: "equal" | "quantile" | "natural", k: number): Classification {
  const r = classify(values, m, k);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe("classify", () => {
  it("equal interval splits the range evenly and counts every value once", () => {
    const c = ok([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], "equal", 4);
    expect(c.breaks).toEqual([0, 25, 50, 75, 100]);
    expect(c.counts.reduce((a, b) => a + b, 0)).toBe(11);
    expect(c.counts).toEqual([3, 2, 3, 3]); // 0,10,20 | 30,40 | 50,60,70 | 80,90,100 (max included in last class)
  });
  it("quantile gives near-equal counts", () => {
    const c = ok(Array.from({ length: 20 }, (_, i) => i + 1), "quantile", 4);
    expect(c.counts).toEqual([5, 5, 5, 5]);
  });
  it("natural breaks finds the obvious gaps", () => {
    const c = ok([1, 2, 3, 10, 11, 12, 50, 51, 52], "natural", 3);
    expect(c.breaks).toEqual([1, 10, 50, 52]);
    expect(c.counts).toEqual([3, 3, 3]);
  });
  it("jenks minimises within-class variance versus equal interval on skewed data", () => {
    const data = [1, 2, 2, 3, 3, 4, 5, 6, 8, 9, 40, 42, 45, 300, 310];
    const ssd = (b: number[]) => {
      let total = 0;
      for (let i = 0; i < b.length - 1; i++) {
        const g = data.filter((v) => classIndex(v, b) === i);
        if (!g.length) continue;
        const m = g.reduce((a, c) => a + c, 0) / g.length;
        total += g.reduce((a, c) => a + (c - m) ** 2, 0);
      }
      return total;
    };
    expect(ssd(ok(data, "natural", 3).breaks)).toBeLessThan(ssd(ok(data, "equal", 3).breaks));
  });
  it("handles constant values with one class", () => {
    for (const m of ["equal", "quantile", "natural"] as const) {
      const c = ok([5, 5, 5], m, 5);
      expect(c.classCount).toBe(1);
      expect(c.counts).toEqual([3]);
      expect(c.notes[0]).toMatch(/same/);
    }
  });
  it("handles a single value, two values and fewer unique values than classes", () => {
    expect(ok([7], "quantile", 5).classCount).toBe(1);
    const two = ok([1, 9], "natural", 5);
    expect(two.classCount).toBe(2);
    expect(two.counts).toEqual([1, 1]);
    const few = ok([1, 1, 1, 2, 2, 3], "equal", 7);
    expect(few.classCount).toBeLessThanOrEqual(3);
    expect(few.notes.join(" ")).toMatch(/Only 3 different values/);
  });
  it("removes duplicate quantile breaks caused by ties", () => {
    const c = ok([0, 0, 0, 0, 0, 0, 0, 0, 1, 100], "quantile", 5);
    expect(new Set(c.breaks).size).toBe(c.breaks.length);
    expect(c.counts.every((n) => n > 0)).toBe(true);
    expect(c.notes.join(" ")).toMatch(/reduced/);
  });
  it("every value lands in exactly one class, including min and max, for all methods", () => {
    const data = [3.2, 8, 8, 15.5, 22, 22, 22, 40, 41, 97.4, 120];
    for (const m of ["equal", "quantile", "natural"] as const) {
      for (let k = 3; k <= 7; k++) {
        const c = ok(data, m, k);
        expect(classIndex(Math.min(...data), c.breaks)).toBe(0);
        expect(classIndex(Math.max(...data), c.breaks)).toBe(c.classCount - 1);
        expect(c.counts.reduce((a, b) => a + b, 0)).toBe(data.length);
      }
    }
  });
  it("rejects empty input, ignores non-finite, and refuses natural breaks on huge input", () => {
    expect(classify([], "equal", 5).ok).toBe(false);
    expect(classify([NaN, Infinity], "equal", 5).ok).toBe(false);
    expect(ok([1, 2, NaN, 3], "equal", 3).counts.reduce((a, b) => a + b, 0)).toBe(3);
    const big = classify(Array.from({ length: NATURAL_BREAKS_MAX_VALUES + 1 }, (_, i) => i), "natural", 5);
    expect(big.ok).toBe(false);
  });
  it("keeps a lone-outlier top class (natural breaks) and labels it with a single value", () => {
    const c = ok([1, 2, 3, 4, 1000], "natural", 2);
    expect(c.breaks).toEqual([1, 1000, 1000]);
    expect(c.counts).toEqual([4, 1]);
    expect(classLabels(c)).toEqual(["1 to under 1,000", "1,000"]);
  });
  it("handles negative and mixed-sign data", () => {
    const c = ok([-50, -10, 0, 10, 50], "equal", 2);
    expect(c.breaks).toEqual([-50, 0, 50]);
    expect(c.counts).toEqual([2, 3]);
  });
  it("jenksBreaks returns k+1 ascending breaks", () => {
    const b = jenksBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4);
    expect(b).toHaveLength(5);
    expect([...b].sort((x, y) => x - y)).toEqual(b);
  });
});

describe("legend labels and symbols", () => {
  it("prints enough decimals that adjacent break labels differ", () => {
    expect(decimalsForBreaks([0, 0.4, 0.8, 1.2])).toBe(1);
    expect(decimalsForBreaks([0, 10, 20])).toBe(0);
    expect(decimalsForBreaks([0.001, 0.002, 0.0031])).toBe(3);
  });
  it("labels the last class inclusively and others as 'to under'", () => {
    const c = ok([0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100], "equal", 4);
    expect(classLabels(c)).toEqual(["0 to under 25", "25 to under 50", "50 to under 75", "75 to 100"]);
  });
  it("labels a single class with just the value", () => {
    expect(classLabels(ok([5, 5], "equal", 4))).toEqual(["5"]);
  });
  it("symbol radius is area-proportional, zero for non-positive values, and capped", () => {
    expect(symbolRadius(100, 100, 30)).toBe(30);
    expect(symbolRadius(25, 100, 30)).toBeCloseTo(15);
    expect(symbolRadius(0, 100, 30)).toBe(0);
    expect(symbolRadius(-4, 100, 30)).toBe(0);
    expect(symbolRadius(0.0001, 100, 30)).toBe(2);
    expect(symbolRadius(500, 100, 30)).toBe(30);
    // area ratio equals value ratio
    expect((symbolRadius(40, 100, 30) / symbolRadius(10, 100, 30)) ** 2).toBeCloseTo(4);
  });
  it("legend symbol values never exceed the data maximum", () => {
    expect(roundDownSig(1366417754)).toBe(1300000000);
    for (const max of [1366417754, 96, 0.0456, 7]) {
      const v = legendSymbolValues(max);
      expect(v.length).toBeGreaterThan(0);
      expect(Math.max(...v)).toBeLessThanOrEqual(max);
      expect(new Set(v).size).toBe(v.length);
    }
  });
});

describe("colour ramps", () => {
  it("returns exact anchors at the ends and valid hex colours throughout", () => {
    for (const r of RAMPS) {
      expect(sampleRamp(r, 0)).toBe(r.anchors[0]);
      expect(sampleRamp(r, 1)).toBe(r.anchors[r.anchors.length - 1]);
      for (const n of [1, 2, 3, 5, 7]) for (const c of classColours(r, n)) expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
  it("reverse flips order and a different class count gives distinct colours", () => {
    const r = getRamp("Blues");
    expect(sampleRamp(r, 0, true)).toBe(sampleRamp(r, 1));
    for (const n of [3, 4, 5, 6, 7]) expect(new Set(classColours(r, n)).size).toBe(n);
  });
  it("clamps out-of-range and NaN positions; unknown ids fall back", () => {
    const r = getRamp("nope");
    expect(sampleRamp(r, -5)).toBe(sampleRamp(r, 0));
    expect(sampleRamp(r, 9)).toBe(sampleRamp(r, 1));
    expect(sampleRamp(r, NaN)).toBe(sampleRamp(r, 0));
  });
});
