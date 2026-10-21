import { describe, expect, it } from "vitest";
import { formatDecimal, formatDegrees, parseCoordinates, wrapLongitude } from "./coordinates";
import { SAMPLE_PLACES } from "./sample-places";

describe("parseCoordinates", () => {
  it("accepts valid values and boundaries", () => {
    for (const [a, b] of [["28.6139", "77.2090"], ["-90", "-180"], ["90", "180"], ["0", "0"], [" 12.5 ", " -45 "], [".5", "5."], ["+10", "+20"]]) {
      expect(parseCoordinates(a as string, b as string).ok).toBe(true);
    }
  });
  it("rejects out-of-range values", () => {
    for (const [a, b] of [["90.0001", "0"], ["-91", "0"], ["0", "180.5"], ["0", "-181"]]) {
      expect(parseCoordinates(a as string, b as string).ok).toBe(false);
    }
  });
  it("rejects blanks and non-numbers", () => {
    for (const [a, b] of [["", "0"], ["0", ""], ["  ", "  "], ["abc", "0"], ["1e1", "0"], ["NaN", "0"], ["Infinity", "0"], ["0x10", "0"], ["1,5", "0"], ["12N", "0"], ["--5", "0"], ["1 2", "0"]]) {
      expect(parseCoordinates(a as string, b as string).ok).toBe(false);
    }
  });
  it("returns the parsed numbers", () => {
    const r = parseCoordinates("28.6139", "77.209");
    expect(r.ok && r.value.lat).toBe(28.6139);
    expect(r.ok && r.value.lng).toBe(77.209);
  });
});

describe("formatting", () => {
  it("formats decimal and degree strings", () => {
    expect(formatDecimal({ lat: 28.61394, lng: 77.209 })).toBe("28.6139, 77.2090");
    expect(formatDegrees({ lat: 28.6139, lng: 77.209 })).toBe("28.6139° N, 77.2090° E");
    expect(formatDegrees({ lat: -0.1807, lng: -78.4678 })).toBe("0.1807° S, 78.4678° W");
  });
  it("shows no hemisphere on the equator or prime meridian and never -0", () => {
    expect(formatDegrees({ lat: 0, lng: 0 })).toBe("0.0000°, 0.0000°");
    expect(formatDecimal({ lat: -0.00001, lng: 0 })).toBe("0.0000, 0.0000");
  });
});

describe("wrapLongitude", () => {
  it("wraps values past the date line", () => {
    expect(wrapLongitude(190)).toBe(-170);
    expect(wrapLongitude(-190)).toBe(170);
    expect(wrapLongitude(540)).toBe(-180);
    expect(wrapLongitude(77.2)).toBe(77.2);
    expect(wrapLongitude(180)).toBe(180);
    expect(wrapLongitude(Number.NaN)).toBe(0);
  });
});

describe("sample places", () => {
  it("are valid, unique and described", () => {
    const ids = SAMPLE_PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of SAMPLE_PLACES) {
      expect(parseCoordinates(String(p.lat), String(p.lng)).ok).toBe(true);
      expect(p.name && p.description).toBeTruthy();
    }
  });
});
