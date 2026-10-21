"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import { formatNumber } from "@/lib/thematic/numbers";
import type { Series, SeriesRecord } from "@/lib/thematic/series";
import { SelectField } from "./thematic-controls";

const PAGE = 100;
type Sort = "name" | "high" | "low";
type Filter = "all" | "mapped" | "issues";

function statusText(r: SeriesRecord, expectRegion: boolean): { text: string; bad: boolean } {
  if (r.status === "missing") return { text: "Missing value", bad: true };
  if (r.status === "invalid") return { text: `Invalid: ${r.detail ?? ""}`, bad: true };
  if (r.status === "duplicate") return { text: "Duplicate (ignored)", bad: true };
  if (expectRegion && r.region === "unmatched") return { text: "Region not found on map", bad: true };
  if (r.coord === "bad") return { text: "Bad coordinates", bad: true };
  return { text: "OK", bad: false };
}

export function ThematicDataTable({
  series, unit, hasRegionColumn, selectedRowIndex, onSelectRow,
}: {
  series: Series; unit: string; hasRegionColumn: boolean; selectedRowIndex: number | null; onSelectRow: (r: SeriesRecord) => void;
}) {
  const [sort, setSort] = useState<Sort>("name");
  const [filter, setFilter] = useState<Filter>("all");
  const [limit, setLimit] = useState(PAGE);

  const rows = useMemo(() => {
    let list = series.records.slice();
    if (filter === "mapped") list = list.filter((r) => r.status === "ok" && (r.featureIndex !== null || r.lat !== null));
    if (filter === "issues") list = list.filter((r) => statusText(r, hasRegionColumn).bad);
    list.sort((a, b) => {
      if (sort === "name") return a.label.localeCompare(b.label);
      const av = a.value, bv = b.value;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return sort === "high" ? bv - av : av - bv;
    });
    return list;
  }, [series.records, sort, filter, hasRegionColumn]);

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Sort by" value={sort} onChange={(v) => { setSort(v as Sort); setLimit(PAGE); }}>
          <option value="name">Name (A to Z)</option>
          <option value="high">Value (high to low)</option>
          <option value="low">Value (low to high)</option>
        </SelectField>
        <SelectField label="Show" value={filter} onChange={(v) => { setFilter(v as Filter); setLimit(PAGE); }}>
          <option value="all">All rows ({series.records.length})</option>
          <option value="mapped">Rows on the map</option>
          <option value="issues">Rows with problems</option>
        </SelectField>
      </div>
      <div className="mt-3 max-h-96 overflow-auto rounded-xl border border-sage-200">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Regional values. Select a row to highlight it on the map.</caption>
          <thead className="sticky top-0 bg-sage-100 text-xs uppercase tracking-wide text-forest-700">
            <tr>
              <th scope="col" className="px-3 py-2">Region / place</th>
              <th scope="col" className="px-3 py-2 text-right">Value{unit ? ` (${unit})` : ""}</th>
              <th scope="col" className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={3} className="px-3 py-6 text-center text-forest-600">No rows to show.</td></tr>
            )}
            {rows.slice(0, limit).map((r) => {
              const st = statusText(r, hasRegionColumn);
              const selectable = r.status === "ok";
              return (
                <tr key={r.rowIndex} className={cn("border-t border-sage-100", selectedRowIndex === r.rowIndex && "bg-brand-50")}>
                  <td className="px-3 py-1.5">
                    {selectable ? (
                      <button type="button" onClick={() => onSelectRow(r)} aria-pressed={selectedRowIndex === r.rowIndex}
                        className="rounded text-left font-medium text-brand-800 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                        {r.label}
                      </button>
                    ) : <span className="font-medium">{r.label}</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono">{r.value !== null ? formatNumber(r.value) : <span className="text-forest-500">{r.raw.trim() || "—"}</span>}</td>
                  <td className={cn("px-3 py-1.5 text-xs", st.bad ? "font-semibold text-danger-700" : "text-forest-600")}>{st.text}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length > limit && (
        <button type="button" onClick={() => setLimit((l) => l + PAGE)} className="mt-2 text-sm font-semibold text-brand-700 hover:underline">
          Show {Math.min(PAGE, rows.length - limit)} more ({rows.length - limit} hidden)
        </button>
      )}
    </div>
  );
}
