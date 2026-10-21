import { formatDegrees, type LatLng } from "./coordinates";

export interface CoordinateInterpretation {
  latitudeHemisphere: "Northern" | "Southern" | "Equator";
  longitudeHemisphere: "Eastern" | "Western" | "Prime Meridian";
  latitudeDegreesFromEquator: number;
  longitudeDegreesFromPrimeMeridian: number;
  coordinateLabel: string;
}

/** Turns a validated coordinate into a school-level interpretation. */
export function interpretCoordinates(point: LatLng): CoordinateInterpretation {
  return {
    latitudeHemisphere: point.lat > 0 ? "Northern" : point.lat < 0 ? "Southern" : "Equator",
    longitudeHemisphere: point.lng > 0 ? "Eastern" : point.lng < 0 ? "Western" : "Prime Meridian",
    latitudeDegreesFromEquator: Math.abs(point.lat),
    longitudeDegreesFromPrimeMeridian: Math.abs(point.lng),
    coordinateLabel: formatDegrees(point),
  };
}

/** Simple equirectangular SVG position inside a 360 × 200 viewBox with 20px padding. */
export function coordinateToGrid(point: LatLng): { x: number; y: number } {
  return {
    x: 20 + ((point.lng + 180) / 360) * 320,
    y: 20 + ((90 - point.lat) / 180) * 160,
  };
}
