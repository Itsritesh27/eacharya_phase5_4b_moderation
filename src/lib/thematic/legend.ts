import { decimalsForBreaks, type Classification } from "./classify";
import { formatNumber } from "./numbers";

/** Fill for regions without data. Shared by the map and its legend so they always match. */
export const NO_DATA_FILL = "#e4e0d4";

export type MapType = "choropleth" | "graduated" | "symbols";

export const MAP_TYPES: readonly { id: MapType; label: string; short: string; help: string }[] = [
  { id: "choropleth", label: "Choropleth map", short: "Choropleth (continuous shading)", help: "Each region is shaded along a smooth colour scale by its value." },
  { id: "graduated", label: "Graduated colour map", short: "Graduated colour (classes)", help: "Values are grouped into classes and each class gets one colour." },
  { id: "symbols", label: "Proportional symbol map", short: "Proportional symbols", help: "Circle area grows with the value. Needs a position for every symbol." },
];

export function mapTypeLabel(t: MapType): string {
  return MAP_TYPES.find((m) => m.id === t)?.short ?? t;
}

export function withUnit(text: string, unit: string): string {
  return unit ? `${text} ${unit}` : text;
}

/** One label per class, e.g. "10 to under 20". The last class includes its upper limit. */
export function classLabels(c: Classification): string[] {
  if (c.classCount === 1) return [formatNumber(c.breaks[0]!, decimalsForBreaks([c.breaks[0]!]))];
  const d = decimalsForBreaks(c.breaks);
  return Array.from({ length: c.classCount }, (_, i) => {
    const lo = formatNumber(c.breaks[i]!, d);
    const hi = formatNumber(c.breaks[i + 1]!, d);
    if (c.breaks[i] === c.breaks[i + 1]) return lo; // top class holding only the maximum value
    return i === c.classCount - 1 ? `${lo} to ${hi}` : `${lo} to under ${hi}`;
  });
}

/** Area-proportional radius in pixels. Zero or negative values get no symbol. */
export function symbolRadius(value: number, maxValue: number, maxRadius: number): number {
  if (!(value > 0) || !(maxValue > 0)) return 0;
  return Math.max(2, maxRadius * Math.sqrt(Math.min(value, maxValue) / maxValue));
}

/** Round DOWN to 2 significant figures so legend circles are never larger than any symbol on the map. */
export function roundDownSig(value: number, sig = 2): number {
  if (!(value > 0)) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(value)) - sig + 1);
  return Math.floor(value / mag) * mag;
}

/** Values drawn in the proportional-symbol legend (largest first). */
export function legendSymbolValues(maxValue: number): number[] {
  const vals = [maxValue, maxValue / 3, maxValue / 10].map((v) => roundDownSig(v));
  return vals.filter((v, i) => v > 0 && vals.indexOf(v) === i);
}
