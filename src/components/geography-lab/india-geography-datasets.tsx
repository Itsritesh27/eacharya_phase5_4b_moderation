"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownToLine, ArrowUpRight, Database, Info, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { INDIA_GEOGRAPHY_DATASETS, type GeographyDataset, type GeographyDatasetValue } from "@/lib/geography-lab/india-datasets";

const ALL_CATEGORIES = "All topics";

function displayValue(value: GeographyDatasetValue | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
  }
  return value;
}

function csvValue(value: GeographyDatasetValue | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function isAggregateRow(row: Record<string, GeographyDatasetValue>): boolean {
  const candidate = row.state_ut ?? row.state ?? row.station;
  return typeof candidate === "string" && /^(india|all india)/i.test(candidate);
}

function DatasetBars({ dataset }: { dataset: GeographyDataset }) {
  if (!dataset.visualKey || !dataset.visualLabel) return null;
  const ranked = dataset.rows
    .filter((row) => !isAggregateRow(row) && typeof row[dataset.visualKey!] === "number")
    .map((row) => ({ row, value: row[dataset.visualKey!] as number }))
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 5);
  if (ranked.length === 0) return null;
  const maximum = Math.max(...ranked.map((item) => Math.abs(item.value)), 1);
  return (
    <section className="rounded-2xl border border-sage-200 bg-sage-50/70 p-4 sm:p-5" aria-label={`Top values: ${dataset.visualLabel}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-forest-950">Quick comparison</h3>
        <p className="text-xs text-forest-600">Top 5 records · {dataset.visualLabel} ({dataset.visualUnit ?? dataset.unit})</p>
      </div>
      <div className="mt-4 space-y-3">
        {ranked.map(({ row, value }) => {
          const label = String(row.state_ut ?? row.state ?? row.station ?? row.year ?? row.indicator ?? row.site_or_region ?? "Record");
          return (
            <div key={label}>
              <div className="mb-1 flex items-center justify-between gap-3 text-sm">
                <span className="font-medium text-forest-800">{label}</span>
                <span className="tabular-nums text-forest-700">{displayValue(value)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-sage-200">
                <div className={`h-full rounded-full ${value < 0 ? "bg-amber-500" : "bg-brand-600"}`} style={{ width: `${Math.max(1, (Math.abs(value) / maximum) * 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function IndiaGeographyDatasets() {
  const categories = useMemo(() => [ALL_CATEGORIES, ...Array.from(new Set(INDIA_GEOGRAPHY_DATASETS.map((dataset) => dataset.category)))], []);
  const [category, setCategory] = useState(ALL_CATEGORIES);
  const [selectedId, setSelectedId] = useState(INDIA_GEOGRAPHY_DATASETS[0]?.id ?? "");
  const [search, setSearch] = useState("");

  const availableDatasets = useMemo(
    () => category === ALL_CATEGORIES ? INDIA_GEOGRAPHY_DATASETS : INDIA_GEOGRAPHY_DATASETS.filter((dataset) => dataset.category === category),
    [category],
  );
  const selectedDataset = INDIA_GEOGRAPHY_DATASETS.find((dataset) => dataset.id === selectedId)
    ?? availableDatasets[0]
    ?? INDIA_GEOGRAPHY_DATASETS[0];
  const filteredRows = useMemo(() => {
    if (!selectedDataset) return [];
    const query = search.trim().toLocaleLowerCase();
    if (!query) return selectedDataset.rows;
    return selectedDataset.rows.filter((row) => Object.values(row).some((value) => String(value ?? "").toLocaleLowerCase().includes(query)));
  }, [selectedDataset, search]);

  function changeCategory(nextCategory: string) {
    setCategory(nextCategory);
    const nextDatasets = nextCategory === ALL_CATEGORIES
      ? INDIA_GEOGRAPHY_DATASETS
      : INDIA_GEOGRAPHY_DATASETS.filter((dataset) => dataset.category === nextCategory);
    if (nextDatasets[0]) setSelectedId(nextDatasets[0].id);
    setSearch("");
  }

  function downloadCsv() {
    if (!selectedDataset) return;
    const header = selectedDataset.columns.map((column) => csvValue(column.label)).join(",");
    const lines = filteredRows.map((row) => selectedDataset.columns.map((column) => csvValue(row[column.key])).join(","));
    const blob = new Blob(["\uFEFF", [header, ...lines].join("\r\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedDataset.id}${search.trim() ? "-filtered" : ""}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  if (!selectedDataset) return <p className="text-sm text-forest-700">No datasets are available.</p>;

  return (
    <div className="space-y-7">
      <div className="rounded-2xl border border-sage-200 bg-white p-4 shadow-card sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-brand-700" aria-hidden />
            <h2 className="font-bold text-forest-950">Explore the dataset library</h2>
          </div>
          <span className="rounded-full bg-sage-100 px-3 py-1 text-xs font-semibold text-forest-700">
            {INDIA_GEOGRAPHY_DATASETS.length} datasets · {INDIA_GEOGRAPHY_DATASETS.reduce((total, dataset) => total + dataset.rows.length, 0).toLocaleString("en-IN")} records
          </span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2" aria-label="Filter datasets by topic">
          {categories.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => changeCategory(item)}
              aria-pressed={category === item}
              className={`rounded-full border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${category === item ? "border-brand-600 bg-brand-600 text-white" : "border-sage-300 bg-white text-forest-800 hover:bg-sage-50"}`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {availableDatasets.map((dataset) => (
            <button
              key={dataset.id}
              type="button"
              onClick={() => { setSelectedId(dataset.id); setSearch(""); }}
              aria-pressed={selectedDataset.id === dataset.id}
              className={`rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${selectedDataset.id === dataset.id ? "border-brand-600 bg-sage-50 ring-1 ring-brand-600" : "border-sage-200 bg-white hover:border-sage-400 hover:bg-sage-50/60"}`}
            >
              <span className="text-xs font-semibold uppercase tracking-wide text-brand-700">{dataset.category}</span>
              <span className="mt-1 block font-bold text-forest-950">{dataset.title}</span>
              <span className="mt-1 block text-xs text-forest-600">{dataset.rows.length} records · {dataset.period}</span>
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-2xl border border-sage-200 bg-white shadow-card" aria-labelledby="dataset-title">
        <div className="border-b border-sage-200 p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <span className="text-xs font-bold uppercase tracking-wide text-brand-700">{selectedDataset.category}</span>
              <h2 id="dataset-title" className="mt-1 text-2xl font-extrabold text-forest-950">{selectedDataset.title}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-forest-700">{selectedDataset.description}</p>
            </div>
            <Button type="button" onClick={downloadCsv}>
              <ArrowDownToLine className="h-4 w-4" aria-hidden /> Download CSV
            </Button>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl bg-sage-50 p-3"><p className="text-xs font-semibold uppercase text-forest-600">Period</p><p className="mt-1 text-sm font-bold text-forest-950">{selectedDataset.period}</p></div>
            <div className="rounded-xl bg-sage-50 p-3"><p className="text-xs font-semibold uppercase text-forest-600">Geography</p><p className="mt-1 text-sm font-bold text-forest-950">{selectedDataset.geography}</p></div>
            <div className="rounded-xl bg-sage-50 p-3"><p className="text-xs font-semibold uppercase text-forest-600">Unit</p><p className="mt-1 text-sm font-bold text-forest-950">{selectedDataset.unit}</p></div>
          </div>
        </div>

        <div className="space-y-5 p-4 sm:p-6">
          <DatasetBars dataset={selectedDataset} />
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div>
              <Label htmlFor="dataset-search">Search current dataset</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-forest-500" aria-hidden />
                <Input id="dataset-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search state, year, category, value…" className="pl-9" />
              </div>
              <p className="mt-1 text-xs text-forest-600">CSV download respects this search filter.</p>
            </div>
            <p className="text-sm font-medium text-forest-700" aria-live="polite">Showing {filteredRows.length} of {selectedDataset.rows.length} records</p>
          </div>

          <div className="overflow-hidden rounded-xl border border-sage-200">
            <div className="max-h-[32rem] overflow-auto">
              <table className="min-w-full border-collapse text-left text-sm">
                <thead className="sticky top-0 z-10 bg-sage-100 text-xs uppercase tracking-wide text-forest-800">
                  <tr>{selectedDataset.columns.map((column) => <th key={column.key} scope="col" className="whitespace-nowrap border-b border-sage-300 px-3 py-3 font-bold">{column.label}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-sage-100 bg-white">
                  {filteredRows.map((row, rowIndex) => (
                    <tr key={`${selectedDataset.id}-${rowIndex}`} className="hover:bg-sage-50/70">
                      {selectedDataset.columns.map((column) => {
                        const value = row[column.key];
                        return (
                          <td key={column.key} className="max-w-sm px-3 py-3 align-top text-forest-800">
                            {typeof value === "string" && /^https?:\/\//.test(value) ? (
                              <a href={value} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 underline underline-offset-2">Open portal <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></a>
                            ) : <span className={typeof value === "number" ? "tabular-nums" : ""}>{displayValue(value)}</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  {filteredRows.length === 0 && <tr><td colSpan={selectedDataset.columns.length} className="px-4 py-10 text-center text-forest-600">No records match this search.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <div className="flex items-start gap-2"><Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /><div><p className="font-bold">Data notes and limitations</p><p className="mt-1 leading-6">{selectedDataset.caveat}</p></div></div>
          </div>

          <div className="flex flex-wrap items-start justify-between gap-4 border-t border-sage-200 pt-4">
            <div className="space-y-1 text-sm">
              <p className="font-bold text-forest-950">Source: {selectedDataset.sourceLabel}</p>
              <a href={selectedDataset.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-700 underline underline-offset-2">Open source <ArrowUpRight className="h-4 w-4" aria-hidden /></a>
              {selectedDataset.extraSources.map((source) => <p key={source.url}><a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-700 underline underline-offset-2">{source.label} <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></a></p>)}
            </div>
            <Link href="/geography-lab/thematic-map-studio" className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-sage-300 bg-white px-4 text-sm font-semibold text-forest-900 transition hover:bg-sage-50">Open Thematic Map Studio <ArrowUpRight className="h-4 w-4" aria-hidden /></Link>
          </div>
        </div>
      </section>

      <aside className="rounded-2xl border border-sage-200 bg-sage-50/70 p-4 text-sm leading-6 text-forest-800 sm:p-5">
        <p className="font-bold">Using these datasets for maps</p>
        <p className="mt-1">Download a CSV and use the table for calculations, graphs and project reports. The current Thematic Map Studio uses world-country boundaries; India state-level choropleths need a matching India states boundary layer. Do not assume state-level maps will render until that geometry is added and tested.</p>
      </aside>
    </div>
  );
}
