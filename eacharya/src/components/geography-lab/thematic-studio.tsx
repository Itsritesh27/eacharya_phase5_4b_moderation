"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Database, Eraser, FileUp, Layers, RotateCcw, Palette, WifiOff } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BOUNDARY_ATTRIBUTION, BOUNDARY_DISCLAIMER, loadBoundaries, type BoundaryCollection } from "@/lib/thematic/boundaries";
import { classIndex, classify, CLASS_METHODS, MAX_CLASSES, MIN_CLASSES, type ClassMethod } from "@/lib/thematic/classify";
import { MAP_TYPES, mapTypeLabel, symbolRadius, withUnit, type MapType } from "@/lib/thematic/legend";
import { buildRegionIndex } from "@/lib/thematic/matching";
import { formatNumber } from "@/lib/thematic/numbers";
import { classColours, DEFAULT_RAMP_ID, getRamp, RAMPS, RAMP_ATTRIBUTION, sampleRamp } from "@/lib/thematic/ramps";
import { buildSeries, type Dataset, type SeriesRecord } from "@/lib/thematic/series";
import { buildStarterDatasets, STARTER_IDS } from "@/lib/thematic/starter-datasets";
import type { RegionInfo, SymbolDatum, ThematicCommand, ThematicMapStatus } from "./thematic-leaflet-map";
import { Pill, SelectField, SyntheticBanner } from "./thematic-controls";
import { ThematicDataTable } from "./thematic-data-table";
import { ThematicImportPanel } from "./thematic-import-panel";
import { ThematicLegend } from "./thematic-legend";

// Leaflet touches window/document on import, so it is never rendered on the server.
const ThematicLeafletMap = dynamic(() => import("./thematic-leaflet-map"), {
  ssr: false,
  loading: () => (
    <div role="status" aria-label="Loading map" className="h-full w-full">
      <Skeleton className="h-full w-full rounded-none" />
      <span className="sr-only">Loading map…</span>
    </div>
  ),
});

const DEFAULTS = { mapType: "choropleth" as MapType, method: "quantile" as ClassMethod, classes: 5, ramp: DEFAULT_RAMP_ID, reverse: false, size: 26, basemap: false };
const UPLOAD_ID = "upload";

export function ThematicStudio() {
  // ---- boundaries
  const [boundaries, setBoundaries] = useState<BoundaryCollection | null>(null);
  const [bState, setBState] = useState<"loading" | "ready" | "error">("loading");
  const [bAttempt, setBAttempt] = useState(0);
  useEffect(() => {
    const ctl = new AbortController();
    setBState("loading");
    loadBoundaries(ctl.signal)
      .then((b) => { setBoundaries(b); setBState("ready"); })
      .catch((e: unknown) => { if (!(e instanceof DOMException && e.name === "AbortError")) setBState("error"); });
    return () => ctl.abort();
  }, [bAttempt]);
  const features = boundaries?.features ?? null;
  const index = useMemo(() => (features ? buildRegionIndex(features) : null), [features]);
  const starters = useMemo(() => (features ? buildStarterDatasets(features) : []), [features]);

  // ---- selections
  const [uploaded, setUploaded] = useState<Dataset | null>(null);
  const [datasetId, setDatasetId] = useState("");
  const [indicatorCol, setIndicatorCol] = useState<number | null>(null);
  const [mapType, setMapType] = useState<MapType>(DEFAULTS.mapType);
  const [method, setMethod] = useState<ClassMethod>(DEFAULTS.method);
  const [classes, setClasses] = useState(DEFAULTS.classes);
  const [rampId, setRampId] = useState(DEFAULTS.ramp);
  const [reverse, setReverse] = useState(DEFAULTS.reverse);
  const [size, setSize] = useState(DEFAULTS.size);
  const [basemap, setBasemap] = useState(DEFAULTS.basemap);
  const [importOpen, setImportOpen] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [command, setCommand] = useState<ThematicCommand | null>(null);
  const [mapStatus, setMapStatus] = useState<ThematicMapStatus>("ready");
  const [online, setOnline] = useState(true);
  const cmdId = useRef(0);
  const send = useCallback((c: Omit<ThematicCommand, "id">) => { cmdId.current += 1; setCommand({ ...c, id: cmdId.current }); }, []);
  useEffect(() => {
    const u = () => setOnline(navigator.onLine);
    u();
    window.addEventListener("online", u); window.addEventListener("offline", u);
    return () => { window.removeEventListener("online", u); window.removeEventListener("offline", u); };
  }, []);

  const datasets = useMemo(() => [...starters, ...(uploaded ? [uploaded] : [])], [starters, uploaded]);
  const dataset = datasets.find((d) => d.id === datasetId) ?? null;
  const indicator = dataset ? (dataset.indicators.find((i) => i.column === indicatorCol) ?? dataset.indicators[0]!) : null;
  const unit = indicator?.unit ?? "";
  const ramp = getRamp(rampId);

  const series = useMemo(
    () => (dataset && indicator ? buildSeries(dataset, indicator, features ?? [], index) : null),
    [dataset, indicator, features, index],
  );

  // ---- which map types the data can support
  const regionValues = useMemo(() => series?.regionRecords.map((r) => r.value as number) ?? [], [series]);
  const symbolRecords = useMemo(
    () => (series?.pointRecords.filter((r) => (r.value as number) > 0).sort((a, b) => (b.value as number) - (a.value as number)) ?? []),
    [series],
  );
  const negativeCount = series ? series.pointRecords.filter((r) => (r.value as number) < 0).length : 0;
  const zeroCount = series ? series.pointRecords.filter((r) => r.value === 0).length : 0;
  const avail: Record<MapType, string | null> = {
    choropleth: regionValues.length > 0 ? null : "needs values that match map regions",
    graduated: regionValues.length > 0 ? null : "needs values that match map regions",
    symbols: symbolRecords.length > 0 ? null : "needs positive values with a position",
  };
  const type: MapType | null = !series ? null : !avail[mapType] ? mapType : (MAP_TYPES.find((m) => !avail[m.id])?.id ?? null);

  // ---- classification, colours, symbols
  const classification = useMemo(() => {
    if (type !== "graduated" || regionValues.length === 0) return null;
    return classify(regionValues, method, classes);
  }, [type, regionValues, method, classes]);
  const classError = classification && !classification.ok ? classification.error : null;
  const cls = classification && classification.ok ? classification.value : null;
  const colours = useMemo(() => (cls ? classColours(ramp, cls.classCount, reverse) : []), [cls, ramp, reverse]);
  const range = useMemo(() => (regionValues.length ? { min: Math.min(...regionValues), max: Math.max(...regionValues) } : null), [regionValues]);

  const regionColours = useMemo(() => {
    const out: (string | null)[] = new Array(features?.length ?? 0).fill(null);
    if (!series || !type || type === "symbols") return out;
    for (const r of series.regionRecords) {
      const v = r.value as number;
      if (type === "graduated") { if (cls) out[r.featureIndex!] = colours[classIndex(v, cls.breaks)] ?? null; }
      else if (range) out[r.featureIndex!] = sampleRamp(ramp, range.max === range.min ? 0.65 : (v - range.min) / (range.max - range.min), reverse);
    }
    return out;
  }, [features, series, type, cls, colours, range, ramp, reverse]);

  const symbolMax = symbolRecords[0] ? (symbolRecords[0].value as number) : 0;
  const symbolColour = sampleRamp(ramp, 0.75, reverse);
  const symbols: SymbolDatum[] = useMemo(
    () => (type === "symbols"
      ? symbolRecords.map((r) => ({
          key: `p:${r.rowIndex}`, lat: r.lat as number, lng: r.lng as number, radius: symbolRadius(r.value as number, symbolMax, size),
          title: r.label, valueText: withUnit(formatNumber(r.value as number), unit),
        }))
      : []),
    [type, symbolRecords, symbolMax, size, unit],
  );

  const regionInfo: RegionInfo[] = useMemo(() => {
    if (!features) return [];
    const byFeature = new Map<number, SeriesRecord>();
    series?.regionRecords.forEach((r) => byFeature.set(r.featureIndex!, r));
    return features.map((f, i) => {
      const r = byFeature.get(i);
      return { title: f.properties.name, valueText: r ? withUnit(formatNumber(r.value as number), unit) : "No data" };
    });
  }, [features, series, unit]);

  // ---- selection details
  const selected = useMemo(() => {
    if (!selectedKey || !series) return null;
    if (selectedKey.startsWith("r:")) {
      const i = Number(selectedKey.slice(2));
      const f = features?.[i];
      if (!f) return null;
      const rec = series.regionRecords.find((r) => r.featureIndex === i);
      return { title: f.properties.name, value: rec ? withUnit(formatNumber(rec.value as number), unit) : null, rowIndex: rec?.rowIndex ?? null, sub: f.properties.continent };
    }
    const row = Number(selectedKey.slice(2));
    const rec = series.records.find((r) => r.rowIndex === row);
    return rec ? { title: rec.label, value: withUnit(formatNumber(rec.value as number), unit), rowIndex: rec.rowIndex, sub: rec.positionSource === "region" ? "Symbol placed at an approximate centre of the region" : `Latitude ${rec.lat?.toFixed(3)}, longitude ${rec.lng?.toFixed(3)}` } : null;
  }, [selectedKey, series, features, unit]);

  // ---- actions
  function chooseDataset(id: string) {
    setDatasetId(id); setIndicatorCol(null); setSelectedKey(null); setImportOpen(false);
    send({ type: "reset" });
  }
  function applyUpload(d: Dataset, col: number) {
    setUploaded(d); setDatasetId(UPLOAD_ID); setIndicatorCol(col); setSelectedKey(null); setImportOpen(false); send({ type: "reset" });
  }
  function clearAll() {
    setDatasetId(""); setUploaded(null); setIndicatorCol(null); setSelectedKey(null); setImportOpen(false); send({ type: "reset" });
  }
  function resetStyle() {
    setMapType(DEFAULTS.mapType); setMethod(DEFAULTS.method); setClasses(DEFAULTS.classes); setRampId(DEFAULTS.ramp);
    setReverse(DEFAULTS.reverse); setSize(DEFAULTS.size); setBasemap(DEFAULTS.basemap);
  }
  function selectRow(r: SeriesRecord) {
    if (type === "symbols" && r.lat !== null && r.lng !== null) {
      setSelectedKey(`p:${r.rowIndex}`); send({ type: "focusPoint", lat: r.lat, lng: r.lng });
    } else if (r.featureIndex !== null) {
      setSelectedKey(`r:${r.featureIndex}`); send({ type: "focusRegion", index: r.featureIndex });
    } else setSelectedKey(null);
  }

  const noteLines: string[] = [];
  if (cls) noteLines.push(...cls.notes);
  if (type === "symbols") {
    if (negativeCount) noteLines.push(`${negativeCount} negative value(s) cannot be drawn as symbols.`);
    if (zeroCount) noteLines.push(`${zeroCount} zero value(s) have no symbol.`);
  }
  const showNoData = (type === "choropleth" || type === "graduated") && (series?.featuresWithoutData.length ?? 0) > 0;
  const basemapAllowed = type === "symbols";
  const names = (idxs: number[]) => idxs.map((i) => features![i]!.properties.name);
  const hasRegionCol = dataset?.regionColumn !== null && dataset?.regionColumn !== undefined;
  const selectedRowIndex = selected?.rowIndex ?? null;
  const tilesOn = basemapAllowed && basemap;

  return (
    <div className="space-y-5">
      {importOpen && <ThematicImportPanel features={features} onApply={applyUpload} onCancel={() => setImportOpen(false)} />}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-3">
          {bState === "error" && (
            <Alert tone="error">
              <p>The boundary data could not be loaded, so country maps and the starter datasets are unavailable. CSV files with latitude and longitude can still be drawn as symbols.</p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={() => setBAttempt((n) => n + 1)}>Try again</Button>
            </Alert>
          )}
          {mapStatus === "error" && <Alert tone="error">The map could not start in this browser. The data table still works. Try reloading or a current browser.</Alert>}
          {(!online || mapStatus === "tiles-failed") && tilesOn && (
            <div role="status" className="flex items-start gap-2.5 rounded-xl border border-sage-300 bg-sage-50 px-3.5 py-3 text-sm text-forest-800">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <p>The OpenStreetMap background could not be loaded. Your data layers still work.</p>
            </div>
          )}

          <div className="relative isolate z-0 h-[60vh] min-h-[340px] overflow-hidden rounded-card border border-sage-200 shadow-card lg:h-[640px]">
            <ThematicLeafletMap
              features={features}
              regionColours={regionColours}
              regionsAreThematic={type === "choropleth" || type === "graduated"}
              regionInfo={regionInfo}
              symbols={symbols}
              symbolColour={symbolColour}
              showBasemap={tilesOn}
              selectedKey={selectedKey}
              command={command}
              onSelect={setSelectedKey}
              onStatus={setMapStatus}
            />
            <div className="pointer-events-none absolute left-14 top-3 z-[500] max-w-[calc(100%-4.5rem)] space-y-1.5">
              <div className="inline-block rounded-xl bg-white/95 px-3 py-1.5 text-xs font-semibold text-forest-900 shadow-card" aria-live="polite">
                {type ? <>Map type: {mapTypeLabel(type)}{cls ? ` · ${CLASS_METHODS.find((m) => m.id === method)?.label} · ${cls.classCount} ${cls.classCount === 1 ? "class" : "classes"}` : ""}</> : "No thematic map yet"}
              </div>
              {dataset?.synthetic && <div className="rounded-xl bg-amber-100/95 px-3 py-1.5 text-xs font-bold text-amber-900 shadow-card">SYNTHETIC DATA – not official</div>}
            </div>
            {bState === "loading" && (
              <div role="status" className="absolute inset-x-0 bottom-3 z-[500] mx-auto w-fit rounded-xl bg-white/95 px-3 py-1.5 text-xs font-medium shadow-card">Loading boundaries…</div>
            )}
            {!dataset && bState !== "loading" && (
              <div className="pointer-events-none absolute inset-0 z-[500] flex items-center justify-center p-4">
                <div className="pointer-events-auto max-w-sm rounded-card bg-white/95 p-5 text-center shadow-lift">
                  <Layers className="mx-auto h-8 w-8 text-brand-700" aria-hidden />
                  <h2 className="mt-2 text-base font-bold">Start a thematic map</h2>
                  <p className="mt-1 text-sm text-forest-700">Choose a dataset on the right, or import your own CSV file. Then pick a map type and a colour ramp.</p>
                  <div className="mt-3 flex flex-wrap justify-center gap-2">
                    {features && <Button size="sm" onClick={() => chooseDataset(STARTER_IDS.population)}>Try the population example</Button>}
                    <Button size="sm" variant="secondary" onClick={() => setImportOpen(true)}>Import CSV</Button>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => send({ type: "reset" })}><RotateCcw className="h-4 w-4" aria-hidden /> Reset view</Button>
            <Button variant="secondary" size="sm" onClick={resetStyle}><Palette className="h-4 w-4" aria-hidden /> Reset style</Button>
            <Button variant="secondary" size="sm" onClick={clearAll} disabled={!dataset}><Eraser className="h-4 w-4" aria-hidden /> Clear data</Button>
          </div>
          <p className="text-xs text-forest-600">
            {BOUNDARY_ATTRIBUTION}.{tilesOn ? " Map background © OpenStreetMap contributors." : ""} {RAMP_ATTRIBUTION} The Mercator projection stretches areas near the poles, so large regions at high latitudes look bigger than they are.
          </p>
          <p className="text-xs text-forest-600">{BOUNDARY_DISCLAIMER}</p>
        </div>

        <div className="space-y-5">
          <Card>
            <CardBody className="space-y-4">
              <h2 className="flex items-center gap-2 text-base font-bold"><Database className="h-4 w-4 text-brand-700" aria-hidden /> 1. Data</h2>
              <SelectField label="Dataset" value={datasetId} onChange={chooseDataset} disabled={bState === "loading" && !uploaded}>
                <option value="">Choose a dataset…</option>
                {starters.length > 0 && (
                  <optgroup label="Starter datasets">
                    {starters.map((d) => <option key={d.id} value={d.id}>{d.title}</option>)}
                  </optgroup>
                )}
                {uploaded && <optgroup label="Your data"><option value={uploaded.id}>{uploaded.title}</option></optgroup>}
              </SelectField>
              {dataset && indicator && (
                dataset.indicators.length > 1 ? (
                  <SelectField label="Indicator" value={String(indicator.column)} onChange={(v) => { setIndicatorCol(Number(v)); setSelectedKey(null); }}>
                    {dataset.indicators.map((i) => <option key={i.column} value={i.column}>{withUnit(i.label, i.unit ? `(${i.unit})` : "")}</option>)}
                  </SelectField>
                ) : (
                  <p className="text-sm"><span className="font-medium text-forest-800">Indicator: </span>{withUnit(indicator.label, indicator.unit ? `(${indicator.unit})` : "")}</p>
                )
              )}
              {dataset ? (
                <div className="space-y-2 text-sm text-forest-700">
                  <div className="flex flex-wrap gap-1.5">
                    <Pill tone={dataset.synthetic ? "warn" : "brand"}>{dataset.synthetic ? "Synthetic" : dataset.origin === "upload" ? "Your upload" : "Demonstration data"}</Pill>
                    <Pill>{dataset.rows.length} rows</Pill>
                  </div>
                  <p>{dataset.description}</p>
                  {dataset.synthetic && <SyntheticBanner />}
                </div>
              ) : (
                <p className="text-sm text-forest-600">No dataset chosen. Starter datasets are demonstrations, not current official statistics.</p>
              )}
              <Button variant="secondary" className="w-full" onClick={() => setImportOpen((o) => !o)}><FileUp className="h-4 w-4" aria-hidden /> Import CSV…</Button>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="space-y-4">
              <h2 className="flex items-center gap-2 text-base font-bold"><Palette className="h-4 w-4 text-brand-700" aria-hidden /> 2. Map style</h2>
              <fieldset disabled={!series}>
                <legend className="text-sm font-medium text-forest-800">Map type</legend>
                <div className="mt-1.5 space-y-1.5">
                  {MAP_TYPES.map((m) => {
                    const reason = series ? avail[m.id] : null;
                    return (
                      <label key={m.id} className={`flex cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-sm ${type === m.id ? "border-brand-500 bg-brand-50" : "border-sage-200"} ${reason || !series ? "cursor-not-allowed opacity-60" : ""}`}>
                        <input type="radio" name="map-type" className="mt-1" checked={type === m.id} disabled={!!reason || !series} onChange={() => setMapType(m.id)} />
                        <span><span className="font-semibold">{m.label}</span><br /><span className="text-xs text-forest-600">{reason ? `Unavailable: ${reason}.` : m.help}</span></span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <SelectField label="Classification" value={method} onChange={(v) => setMethod(v as ClassMethod)} disabled={type !== "graduated"}>
                  {CLASS_METHODS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </SelectField>
                <SelectField label="Classes" value={String(classes)} onChange={(v) => setClasses(Number(v))} disabled={type !== "graduated"}>
                  {Array.from({ length: MAX_CLASSES - MIN_CLASSES + 1 }, (_, i) => MIN_CLASSES + i).map((n) => <option key={n} value={n}>{n}</option>)}
                </SelectField>
              </div>
              {type !== "graduated" && <p className="-mt-2 text-xs text-forest-600">Classification applies to graduated colour maps only.</p>}
              {classError && <Alert tone="error">{classError}</Alert>}

              <SelectField label="Colour ramp" value={rampId} onChange={setRampId} disabled={!series}>
                {RAMPS.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </SelectField>
              <div className="h-3 rounded border border-forest-700/30" style={{ background: `linear-gradient(to right, ${Array.from({ length: 8 }, (_, i) => sampleRamp(ramp, i / 7, reverse)).join(", ")})` }} aria-hidden />
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={reverse} onChange={(e) => setReverse(e.target.checked)} className="h-4 w-4 rounded border-sage-300 text-brand-600" /> Reverse colours
              </label>

              <div>
                <label htmlFor="sym-size" className="block text-sm font-medium text-forest-800">Largest symbol size: {size}px</label>
                <input id="sym-size" type="range" min={12} max={48} value={size} disabled={type !== "symbols"} onChange={(e) => setSize(Number(e.target.value))} className="mt-1 w-full accent-brand-600" />
              </div>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={basemap} disabled={!basemapAllowed} onChange={(e) => setBasemap(e.target.checked)} className="h-4 w-4 rounded border-sage-300 text-brand-600" />
                Show OpenStreetMap background (symbol maps)
              </label>
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[22rem_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card>
            <CardBody>
              <h2 className="mb-3 text-base font-bold">Legend</h2>
              {type && dataset && indicator && series && (
                (type === "graduated" && !cls) ? <p className="text-sm text-forest-600">The legend appears once the values can be classified.</p> : (
                  <ThematicLegend
                    type={type} title={indicator.label} unit={unit} synthetic={dataset.synthetic} source={dataset.source} noteLines={noteLines}
                    classification={cls} classColours={colours}
                    gradient={range ? { ...range, colours: Array.from({ length: 8 }, (_, i) => sampleRamp(ramp, i / 7, reverse)) } : null}
                    symbolMax={symbolMax} symbolMaxRadius={size} symbolColour={symbolColour} showNoData={showNoData}
                  />
                )
              )}
              {(!type || !dataset) && <p className="text-sm text-forest-600">Choose a dataset to see the legend. If the data cannot be matched to the map, no map is drawn and no legend is shown.</p>}
              {dataset && series && !type && <Alert tone="error">None of the rows in this dataset could be placed on the map. Check the region column and matching setting in the import panel.</Alert>}
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              <h2 className="text-base font-bold">Selected</h2>
              <div aria-live="polite" className="mt-2 text-sm">
                {selected ? (
                  <div className="space-y-1">
                    <p className="font-semibold">{selected.title}</p>
                    <p className="text-forest-600">{selected.sub}</p>
                    <p className="text-lg font-bold text-brand-800">{selected.value ?? "No data for this region"}</p>
                    <Button size="sm" variant="ghost" onClick={() => setSelectedKey(null)}>Clear selection</Button>
                  </div>
                ) : <p className="text-forest-600">Hover over the map to see a value, or click a region or symbol to select it. You can also select a row in the table.</p>}
              </div>
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardBody className="space-y-4">
            <h2 className="text-base font-bold">Regional values</h2>
            {series && dataset ? (
              <>
                <p className="text-sm text-forest-700" aria-live="polite">
                  {series.regionRecords.length > 0 && <><strong>{series.regionRecords.length}</strong> regions shaded{features ? `, ${series.featuresWithoutData.length} of ${features.length} have no data` : ""}. </>}
                  {series.counts.unmatched > 0 && <span className="font-semibold text-danger-700">{series.counts.unmatched} row(s) did not match a map region. </span>}
                  {series.counts.invalid + series.counts.missing + series.counts.duplicate > 0 && <span className="font-semibold text-danger-700">{series.counts.invalid + series.counts.missing + series.counts.duplicate} row(s) were skipped (missing, invalid or duplicate).</span>}
                </p>
                <ThematicDataTable series={series} unit={unit} hasRegionColumn={!!hasRegionCol} selectedRowIndex={selectedRowIndex} onSelectRow={selectRow} />
                {features && series.regionRecords.length > 0 && series.featuresWithoutData.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer font-semibold">Map regions with no data ({series.featuresWithoutData.length})</summary>
                    <p className="mt-2 max-h-40 overflow-y-auto text-forest-700">{names(series.featuresWithoutData).join(", ")}</p>
                  </details>
                )}
              </>
            ) : (
              <p className="text-sm text-forest-600">The values for each region will be listed here. Choose a dataset or import a CSV file to begin.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
