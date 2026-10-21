import { describe, expect, it } from "vitest";
import { backBearing, bearingToCompass, parseBearing } from "./bearing";

describe("bearing", () => {
  it("maps bearings to 8 compass points", () => {
    expect(bearingToCompass(0)).toBe("N");
    expect(bearingToCompass(44)).toBe("NE");
    expect(bearingToCompass(90)).toBe("E");
    expect(bearingToCompass(225)).toBe("SW");
    expect(bearingToCompass(359)).toBe("N");
  });
  it("computes back bearings", () => {
    expect(backBearing(30)).toBe(210);
    expect(backBearing(210)).toBe(30);
    expect(backBearing(180)).toBe(0);
  });
  it("parses only 0 to <360", () => {
    expect(parseBearing("45")).toBe(45);
    for (const t of ["360", "-1", "abc", "", "400"]) expect(parseBearing(t)).toBeNull();
  });
});
