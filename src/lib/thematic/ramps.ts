/**
 * Sequential colour ramps. Anchor colours are the 7-class sequential schemes from ColorBrewer
 * (Cynthia Brewer, colorbrewer2.org; Apache-2.0 licensed). Fewer or more classes are sampled by
 * linear interpolation between the anchors.
 */
export interface Ramp {
  id: string;
  label: string;
  anchors: readonly string[];
}

export const RAMPS: readonly Ramp[] = [
  { id: "YlGnBu", label: "Yellow – green – blue", anchors: ["#ffffcc", "#c7e9b4", "#7fcdbb", "#41b6c4", "#1d91c0", "#225ea8", "#0c2c84"] },
  { id: "Blues", label: "Blues", anchors: ["#eff3ff", "#c6dbef", "#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#084594"] },
  { id: "Greens", label: "Greens", anchors: ["#edf8e9", "#c7e9c0", "#a1d99b", "#74c476", "#41ab5d", "#238b45", "#005a32"] },
  { id: "YlOrRd", label: "Yellow – orange – red", anchors: ["#ffffb2", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#b10026"] },
  { id: "Oranges", label: "Oranges", anchors: ["#feedde", "#fdd0a2", "#fdae6b", "#fd8d3c", "#f16913", "#d94801", "#8c2d04"] },
  { id: "Purples", label: "Purples", anchors: ["#f2f0f7", "#dadaeb", "#bcbddc", "#9e9ac8", "#807dba", "#6a51a3", "#4a1486"] },
];

export const DEFAULT_RAMP_ID = "YlGnBu";
export const RAMP_ATTRIBUTION = "Colour schemes from ColorBrewer (colorbrewer2.org) by Cynthia Brewer.";

export function getRamp(id: string): Ramp {
  return RAMPS.find((r) => r.id === id) ?? RAMPS[0]!;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgbToHex([r, g, b]: [number, number, number]): string {
  return "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
}

/** Colour at position t (0..1) along the ramp. */
export function sampleRamp(ramp: Ramp, t: number, reverse = false): string {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const pos = (reverse ? 1 - clamped : clamped) * (ramp.anchors.length - 1);
  const i = Math.min(ramp.anchors.length - 2, Math.floor(pos));
  const f = pos - i;
  const a = hexToRgb(ramp.anchors[i]!);
  const b = hexToRgb(ramp.anchors[i + 1]!);
  return rgbToHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
}

/** `count` evenly spaced colours for a classified map (class 0 = lowest values). */
export function classColours(ramp: Ramp, count: number, reverse = false): string[] {
  if (count <= 1) return [sampleRamp(ramp, 0.65, reverse)];
  return Array.from({ length: count }, (_, i) => sampleRamp(ramp, i / (count - 1), reverse));
}
