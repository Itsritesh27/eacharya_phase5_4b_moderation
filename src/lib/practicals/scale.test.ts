import { describe, expect, it } from "vitest";
import { mapToGround, parseRepresentativeFraction } from "./scale";

describe("representative fraction", () => {
  it("accepts common formats", () => {
    for (const t of ["1:50000", "1:50,000", " 1 : 50,000 ", "1/50000"]) {
      const r = parseRepresentativeFraction(t);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value).toBe(50000);
    }
  });
  it("rejects bad input", () => {
    for (const t of ["", "50000", "2:50000", "1:0", "1:-5", "1:abc", "1:5e4", "1:1.5", "1:", "1:999999999999"]) {
      expect(parseRepresentativeFraction(t).ok).toBe(false);
    }
  });
});

describe("mapToGround", () => {
  it("converts 4 cm at 1:50,000 to 2 km", () => {
    const r = mapToGround("4", "cm", "1:50,000");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.groundKm).toBeCloseTo(2, 9);
      expect(r.value.groundMetres).toBeCloseTo(2000, 6);
      expect(r.value.steps.length).toBeGreaterThan(3);
    }
  });
  it("handles mm and m", () => {
    const mm = mapToGround("40", "mm", "1:50000");
    const m = mapToGround("0.04", "m", "1:50000");
    expect(mm.ok && m.ok).toBe(true);
    if (mm.ok && m.ok) {
      expect(mm.value.groundKm).toBeCloseTo(2, 9);
      expect(m.value.groundKm).toBeCloseTo(2, 9);
    }
  });
  it("handles 1:1 and a very large scale", () => {
    const r = mapToGround("1", "cm", "1:1");
    expect(r.ok && r.value.groundCm === 1).toBe(true);
    const big = mapToGround("10", "cm", "1:25,000,000");
    expect(big.ok && Math.abs(big.value.groundKm - 2500) < 1e-6).toBe(true);
  });
  it("rejects zero, negative, text, unknown units", () => {
    for (const d of ["0", "-3", "abc", "", "1e999", "NaN", "5%"]) expect(mapToGround(d, "cm", "1:50000").ok).toBe(false);
    expect(mapToGround("4", "km", "1:50000").ok).toBe(false);
    expect(mapToGround("4", "cm", "").ok).toBe(false);
    expect(mapToGround("50000", "m", "1:50000").ok).toBe(false);
  });
});
