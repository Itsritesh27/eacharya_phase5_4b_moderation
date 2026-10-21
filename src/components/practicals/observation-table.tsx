"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkCell, computedValue, isRowBlank } from "@/lib/practicals/rows";
import type { ObservationTable as TableSpec } from "@/lib/practicals/types";
import { CELL_LIMIT } from "@/lib/practicals/types";
import { cn } from "@/lib/utils/cn";

const cell = "h-10 w-full rounded-lg border border-sage-300 bg-white px-2.5 text-sm text-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 aria-[invalid=true]:border-danger-600";

export function ObservationTable({
  spec, rows, measurements, onChange,
}: { spec: TableSpec; rows: Record<string, string>[]; measurements: Record<string, string>; onChange: (rows: Record<string, string>[]) => void }) {
  function setCell(i: number, key: string, value: string) {
    onChange(rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }
  return (
    <div className="space-y-3">
      <div role="region" aria-label={`${spec.caption} (scrolls sideways on small screens)`} tabIndex={0} className="overflow-x-auto rounded-xl border border-sage-200">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <caption className="sr-only">{spec.caption}</caption>
          <thead className="bg-sage-50 text-forest-800">
            <tr>
              <th scope="col" className="w-10 px-2 py-2">#</th>
              {spec.columns.map((c) => <th key={c.key} scope="col" className="px-2 py-2">{c.label}{c.unit ? ` (${c.unit})` : ""}{c.required ? <span aria-hidden className="text-danger-600"> *</span> : null}</th>)}
              {spec.computed?.map((c) => <th key={c.key} scope="col" className="bg-sand-100 px-2 py-2">{c.label}{c.unit ? ` (${c.unit})` : ""} <span className="text-xs font-normal text-forest-600">(calculated)</span></th>)}
              <th scope="col" className="w-12 px-2 py-2"><span className="sr-only">Remove row</span></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const started = !isRowBlank(row);
              return (
                <tr key={i} className="border-t border-sage-200 align-top">
                  <th scope="row" className="px-2 py-2 text-forest-600">{i + 1}</th>
                  {spec.columns.map((c) => {
                    const value = row[c.key] ?? "";
                    const check = started || value.trim() !== "" ? checkCell(c, value) : { ok: true as const };
                    const label = `${c.label}, row ${i + 1}`;
                    const errId = `err-${i}-${c.key}`;
                    return (
                      <td key={c.key} className="px-2 py-2">
                        {c.kind === "select" ? (
                          <select aria-label={label} value={value} onChange={(e) => setCell(i, c.key, e.target.value)} aria-invalid={!check.ok ? true : undefined} aria-describedby={!check.ok ? errId : undefined} className={cell}>
                            <option value="">Choose…</option>
                            {c.options?.map((o) => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            aria-label={label}
                            value={value}
                            maxLength={CELL_LIMIT}
                            inputMode={c.kind === "number" ? "decimal" : "text"}
                            autoComplete="off"
                            onChange={(e) => setCell(i, c.key, e.target.value)}
                            aria-invalid={!check.ok ? true : undefined}
                            aria-describedby={!check.ok ? errId : undefined}
                            className={cell}
                          />
                        )}
                        {!check.ok && <p id={errId} role="alert" className="mt-1 text-xs text-danger-600">{check.error}</p>}
                      </td>
                    );
                  })}
                  {spec.computed?.map((c) => {
                    const v = computedValue(c.kind, row[c.from] ?? "", measurements);
                    return (
                      <td key={c.key} className={cn("bg-sand-100/60 px-2 py-2 font-medium", v === null && "text-forest-500")}>
                        <span aria-label={`${c.label}, row ${i + 1}`}>{v ?? "–"}</span>
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-right">
                    <Button variant="ghost" size="sm" disabled={rows.length <= spec.minRows} aria-label={`Remove row ${i + 1}`} onClick={() => onChange(rows.filter((_, idx) => idx !== i))}>
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" disabled={rows.length >= spec.maxRows} onClick={() => onChange([...rows, {}])}>
          <Plus className="h-4 w-4" aria-hidden /> Add row
        </Button>
        <p className="text-xs text-forest-600">{rows.length} of {spec.maxRows} rows · * required · at least {spec.minRows} complete rows needed</p>
      </div>
    </div>
  );
}
