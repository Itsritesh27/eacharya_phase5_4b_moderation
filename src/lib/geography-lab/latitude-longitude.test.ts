import { describe, expect, it } from "vitest";
import { coordinateToGrid, interpretCoordinates } from "./latitude-longitude";

describe("latitude and longitude learning helpers", () => {
  it("identifies hemispheres for Delhi", () => {
    const result = interpretCoordinates({ lat: 28.6139, lng: 77.209 });
    expect(result.latitudeHemisphere).toBe("Northern");
    expect(result.longitudeHemisphere).toBe("Eastern");
    expect(result.coordinateLabel).toContain("N");
    expect(result.coordinateLabel).toContain("E");
  });

  it("handles the Equator and Prime Meridian exactly", () => {
    const result = interpretCoordinates({ lat: 0, lng: 0 });
    expect(result.latitudeHemisphere).toBe("Equator");
    expect(result.longitudeHemisphere).toBe("Prime Meridian");
    expect(result.latitudeDegreesFromEquator).toBe(0);
    expect(result.longitudeDegreesFromPrimeMeridian).toBe(0);
  });

  it("maps the four coordinate extremes to the grid frame", () => {
    expect(coordinateToGrid({ lat: 90, lng: -180 })).toEqual({ x: 20, y: 20 });
    expect(coordinateToGrid({ lat: -90, lng: 180 })).toEqual({ x: 340, y: 180 });
  });
});
