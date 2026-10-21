import { SyntheticBanner } from "./thematic-controls";
import type { Classification } from "@/lib/thematic/classify";
import { NO_DATA_FILL, classLabels, legendSymbolValues, mapTypeLabel, symbolRadius, withUnit, type MapType } from "@/lib/thematic/legend";
import { formatNumber } from "@/lib/thematic/numbers";

export interface LegendProps {
  type: MapType;
  title: string;
  unit: string;
  synthetic: boolean;
  source: string;
  noteLines: string[];
  /** graduated */
  classification: Classification | null;
  classColours: readonly string[];
  /** choropleth */
  gradient: { min: number; max: number; colours: readonly string[] } | null;
  /** symbols */
  symbolMax: number;
  symbolMaxRadius: number;
  symbolColour: string;
  showNoData: boolean;
}

export function ThematicLegend(p: LegendProps) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Active map type: {mapTypeLabel(p.type)}</p>
      <h3 className="mt-1 text-base font-bold">{withUnit(p.title, p.unit ? `(${p.unit})` : "")}</h3>
      {p.synthetic && <div className="mt-2"><SyntheticBanner /></div>}

      {p.type === "graduated" && p.classification && (
        <ul className="mt-3 space-y-1.5" aria-label="Map classes">
          {classLabels(p.classification).map((label, i) => (
            <li key={i} className="flex items-center gap-2.5 text-sm">
              <span className="h-5 w-8 shrink-0 rounded border border-forest-700/30" style={{ backgroundColor: p.classColours[i] }} aria-hidden />
              <span className="font-medium">{label}</span>
              <span className="ml-auto text-xs text-forest-600">{p.classification!.counts[i]} {p.classification!.counts[i] === 1 ? "region" : "regions"}</span>
            </li>
          ))}
        </ul>
      )}

      {p.type === "choropleth" && p.gradient && (
        <div className="mt-3">
          <div className="h-4 w-full rounded border border-forest-700/30" style={{ background: `linear-gradient(to right, ${p.gradient.colours.join(", ")})` }} aria-hidden />
          <div className="mt-1 flex justify-between text-xs font-medium">
            <span>{formatNumber(p.gradient.min)}</span>
            <span>{formatNumber(p.gradient.max)}</span>
          </div>
          <p className="mt-1 text-xs text-forest-600">Lowest value to highest value, shaded smoothly.</p>
        </div>
      )}

      {p.type === "symbols" && (
        <div className="mt-3">
          <div className="flex items-end gap-4">
            {legendSymbolValues(p.symbolMax).map((v) => {
              const r = symbolRadius(v, p.symbolMax, p.symbolMaxRadius);
              return (
                <div key={v} className="flex flex-col items-center gap-1 text-xs font-medium">
                  <span className="rounded-full border border-forest-950" style={{ width: r * 2, height: r * 2, backgroundColor: p.symbolColour, opacity: 0.65 }} aria-hidden />
                  {formatNumber(v)}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-forest-600">Circle area is proportional to the value. Symbols sit at an approximate centre of each region unless the data has coordinates.</p>
        </div>
      )}

      {p.showNoData && (
        <p className="mt-3 flex items-center gap-2.5 text-sm">
          <span className="h-5 w-8 shrink-0 rounded border border-forest-700/30" style={{ backgroundColor: NO_DATA_FILL }} aria-hidden />
          No data
        </p>
      )}
      {p.noteLines.map((n) => <p key={n} className="mt-2 text-xs text-forest-600">{n}</p>)}
      <p className="mt-3 border-t border-sage-200 pt-2 text-xs text-forest-600"><span className="font-semibold">Source:</span> {p.source}</p>
    </div>
  );
}
