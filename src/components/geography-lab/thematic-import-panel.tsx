"use client";

import { useMemo, useRef, useState } from "react";
import { FileUp, FlaskConical, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { BoundaryFeature } from "@/lib/thematic/boundaries";
import { CSV_LIMITS, parseCsv, type ParsedCsv } from "@/lib/thematic/csv";
import { buildRegionIndex, detectMatchBy, MATCH_BY_OPTIONS, type MatchBy } from "@/lib/thematic/matching";
import { buildSeries, detectNumericColumns, type Dataset } from "@/lib/thematic/series";
import { SAMPLE_CSV_TEXT } from "@/lib/thematic/starter-datasets";
import { SelectField } from "./thematic-controls";

const NONE = "-1";
const REGION_HEADER = /^(country|region|state|nation|territory|district|area|name|place|location)/i;
const LAT_HEADER = /^(lat|latitude)$/i;
const LNG_HEADER = /^(lng|lon|long|longitude)$/i;

function guessMapping(csv: ParsedCsv, features: readonly BoundaryFeature[] | null) {
  const h = csv.headers;
  const lat = h.findIndex((x) => LAT_HEADER.test(x));
  const lng = h.findIndex((x) => LNG_HEADER.test(x));
  const coords = lat >= 0 && lng >= 0;
  const numeric = new Set(detectNumericColumns(h, csv.rows, new Set(coords ? [lat, lng] : [])));
  // Choose the text column whose values actually match map regions best; header names only break ties.
  const textCols = h.map((_, i) => i).filter((i) => !numeric.has(i) && i !== lat && i !== lng);
  const idx = features ? buildRegionIndex(features) : null;
  let region = -1;
  let matchBy: MatchBy = "name";
  let bestRate = -1;
  for (const i of textCols) {
    const det = idx ? detectMatchBy(idx, csv.rows.map((r) => r[i] ?? "")) : { by: "name" as MatchBy, rate: 0 };
    const rate = det.rate + (REGION_HEADER.test(h[i]!) ? 0.001 : 0);
    if (rate > bestRate) { bestRate = rate; region = i; matchBy = det.by; }
  }
  // With no column matching any region (and coordinates available) it is a points file: leave region unset.
  if (coords && idx && bestRate < 0.2) region = -1;
  const indicators = detectNumericColumns(h, csv.rows, new Set([region, coords ? lat : -1, coords ? lng : -1]));
  return { region, matchBy, lat: coords ? lat : -1, lng: coords ? lng : -1, indicator: indicators[0] ?? -1 };
}

export function ThematicImportPanel({
  features, onApply, onCancel,
}: {
  features: readonly BoundaryFeature[] | null; onApply: (d: Dataset, indicatorColumn: number) => void; onCancel: () => void;
}) {
  const [fileName, setFileName] = useState("");
  const [csv, setCsv] = useState<ParsedCsv | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [region, setRegion] = useState(NONE);
  const [matchBy, setMatchBy] = useState<MatchBy>("name");
  const [lat, setLat] = useState(NONE);
  const [lng, setLng] = useState(NONE);
  const [indicator, setIndicator] = useState(NONE);
  const [unit, setUnit] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function load(text: string, name: string) {
    const r = parseCsv(text);
    if (!r.ok) { setError(r.error); setCsv(null); return; }
    const g = guessMapping(r.data, features);
    setError(null); setCsv(r.data); setFileName(name);
    setRegion(String(g.region)); setMatchBy(g.matchBy); setLat(String(g.lat)); setLng(String(g.lng));
    setIndicator(String(g.indicator)); setUnit("");
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/\.(csv|tsv|txt)$/i.test(file.name)) { setError("Please choose a .csv file (or .tsv / .txt with comma, semicolon or tab separators)."); setCsv(null); return; }
    if (file.size > CSV_LIMITS.maxBytes) { setError(`That file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is ${CSV_LIMITS.maxBytes / 1024 / 1024} MB.`); setCsv(null); return; }
    try { load(await file.text(), file.name); } catch { setError("The file could not be read."); setCsv(null); }
  }

  const cols = { region: Number(region), lat: Number(lat), lng: Number(lng), indicator: Number(indicator) };
  const draft: Dataset | null = useMemo(() => {
    if (!csv || cols.indicator < 0) return null;
    const hasCoords = cols.lat >= 0 && cols.lng >= 0 && cols.lat !== cols.lng;
    const used = new Set([cols.region, hasCoords ? cols.lat : -1, hasCoords ? cols.lng : -1]);
    const numeric = detectNumericColumns(csv.headers, csv.rows, used);
    if (!numeric.includes(cols.indicator)) numeric.push(cols.indicator);
    return {
      id: "upload", title: fileName || "Uploaded CSV", description: "Your uploaded data. It stays in this browser tab and is not sent anywhere.",
      origin: "upload", synthetic: false, source: `Uploaded by you (${fileName || "CSV"}). Not verified by eAcharya.`,
      columns: csv.headers, rows: csv.rows,
      regionColumn: cols.region >= 0 ? cols.region : null, matchBy: cols.region >= 0 ? matchBy : null,
      latColumn: hasCoords ? cols.lat : null, lngColumn: hasCoords ? cols.lng : null,
      indicators: numeric.sort((a, b) => a - b).map((c) => ({ column: c, label: csv.headers[c]!, unit: c === cols.indicator ? unit.trim().slice(0, 30) : "" })),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [csv, fileName, region, matchBy, lat, lng, indicator, unit]);

  const series = useMemo(() => {
    if (!draft) return null;
    const ind = draft.indicators.find((i) => i.column === cols.indicator)!;
    const feats = features ?? [];
    return buildSeries(draft, ind, feats, features ? buildRegionIndex(features) : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, features]);

  const problems: string[] = [];
  if (csv) {
    if (cols.indicator < 0) problems.push("No numeric column was found. Choose the column that holds the numbers to map.");
    if (cols.region < 0 && !(cols.lat >= 0 && cols.lng >= 0)) problems.push("Choose a region column, or both a latitude and a longitude column.");
    if ((cols.lat >= 0) !== (cols.lng >= 0)) problems.push("Choose both latitude and longitude, or neither.");
    if (cols.region >= 0 && !features) problems.push("Boundaries are not loaded, so regions cannot be matched. Points with coordinates still work.");
    if (series && series.counts.valid === 0 && cols.indicator >= 0) problems.push("There are no valid numbers in the chosen column.");
    else if (series && series.regionRecords.length === 0 && series.pointRecords.length === 0 && problems.length === 0)
      problems.push("None of the rows could be placed on the map. Check the region column and the 'match by' setting.");
  }
  const canApply = !!draft && !!series && problems.length === 0;

  const examples = (pick: (r: NonNullable<typeof series>["records"][number]) => boolean, text: (r: NonNullable<typeof series>["records"][number]) => string) =>
    series ? series.records.filter(pick).slice(0, 5).map((r) => `Line ${csv!.lineNumbers[r.rowIndex]}: ${text(r)}`) : [];

  const colOptions = csv ? csv.headers.map((h, i) => <option key={i} value={i}>{h}</option>) : null;

  return (
    <Card>
      <CardBody className="space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">Import a CSV file</h2>
            <p className="mt-0.5 text-sm text-forest-600">
              The file is read in your browser only. It is never uploaded or saved, and nothing in it is run as code. Limits: {CSV_LIMITS.maxBytes / 1024 / 1024} MB, {CSV_LIMITS.maxRows.toLocaleString("en-IN")} rows, {CSV_LIMITS.maxColumns} columns.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={onCancel} aria-label="Close import panel"><X className="h-4 w-4" aria-hidden /></Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={onFile} className="sr-only" id="csv-file" />
          <Button onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" aria-hidden /> Choose CSV file</Button>
          <Button variant="secondary" onClick={() => load(SAMPLE_CSV_TEXT, "sample-synthetic.csv")}><FlaskConical className="h-4 w-4" aria-hidden /> Try the sample CSV</Button>
          {fileName && <span className="text-sm text-forest-700">Loaded: <span className="font-semibold">{fileName}</span></span>}
        </div>

        {error && <Alert tone="error">{error}</Alert>}

        <details className="rounded-xl border border-sage-200 bg-sage-50/60 px-4 py-3 text-sm" open={!csv}>
          <summary className="cursor-pointer font-semibold">Supported CSV format</summary>
          <div className="mt-2 space-y-2 text-forest-700">
            <p>The first row must be column names. Use one row per region or place. Commas, semicolons or tabs can separate the columns.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong>Region column</strong>: a country name (e.g. <code>India</code>) or ISO code (<code>IND</code> or <code>IN</code>). Needed for shaded maps.</li>
              <li><strong>Number column</strong>: plain numbers such as <code>1234.5</code>. Leave blank or write <code>NA</code> if unknown. Do not add %, units or text.</li>
              <li><strong>Latitude and longitude</strong> (optional): decimal degrees, needed to place symbols at exact points.</li>
            </ul>
            <pre className="overflow-x-auto rounded-lg bg-white p-3 text-xs">{SAMPLE_CSV_TEXT}</pre>
            <p className="text-xs">The sample values are SYNTHETIC practice numbers, not real data. Boundaries cover the 177 countries in Natural Earth&rsquo;s 1:110m set, so some small countries cannot be shaded.</p>
          </div>
        </details>

        {csv && (
          <>
            <div>
              <h3 className="text-sm font-bold">Preview (first {Math.min(8, csv.rows.length)} of {csv.rows.length} rows)</h3>
              <div className="mt-2 overflow-x-auto rounded-xl border border-sage-200">
                <table className="w-full text-left text-xs">
                  <thead className="bg-sage-100 text-forest-700"><tr>{csv.headers.map((h, i) => <th key={i} scope="col" className="whitespace-nowrap px-2.5 py-1.5">{h}</th>)}</tr></thead>
                  <tbody>
                    {csv.rows.slice(0, 8).map((r, i) => (
                      <tr key={i} className="border-t border-sage-100">{r.map((c, j) => <td key={j} className="max-w-[14rem] truncate whitespace-nowrap px-2.5 py-1.5">{c}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {csv.warnings.map((w) => <p key={w} className="mt-2 text-xs font-medium text-danger-700">{w}</p>)}
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <SelectField label="Number column (indicator)" value={indicator} onChange={setIndicator}>
                <option value={NONE}>Choose…</option>{colOptions}
              </SelectField>
              <SelectField label="Region column" value={region} onChange={setRegion} hint="Leave as 'None' if you only have latitude and longitude.">
                <option value={NONE}>None</option>{colOptions}
              </SelectField>
              <SelectField label="Match regions by" value={matchBy} onChange={(v) => setMatchBy(v as MatchBy)} disabled={region === NONE}>
                {MATCH_BY_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
              </SelectField>
              <SelectField label="Latitude column (optional)" value={lat} onChange={setLat}><option value={NONE}>None</option>{colOptions}</SelectField>
              <SelectField label="Longitude column (optional)" value={lng} onChange={setLng}><option value={NONE}>None</option>{colOptions}</SelectField>
              <div>
                <label htmlFor="unit" className="block text-sm font-medium text-forest-800">Unit label (optional)</label>
                <Input id="unit" value={unit} maxLength={30} onChange={(e) => setUnit(e.target.value)} placeholder="e.g. mm, %, people" className="mt-1 h-10" />
              </div>
            </div>

            {series && (
              <div className="space-y-2" aria-live="polite">
                <h3 className="text-sm font-bold">Validation</h3>
                <p className="text-sm">
                  <strong>{series.counts.valid}</strong> of {series.counts.rows} rows have a usable number.
                  {" "}{series.regionRecords.length > 0 && <>{series.regionRecords.length} matched to a map region. </>}
                  {series.pointRecords.length > 0 && <>{series.pointRecords.length} can be drawn as symbols.</>}
                </p>
                {series.counts.missing > 0 && <p className="text-sm text-danger-700"><strong>{series.counts.missing}</strong> row(s) have no value in the number column.</p>}
                {series.counts.invalid > 0 && (
                  <div className="text-sm text-danger-700"><strong>{series.counts.invalid}</strong> row(s) have a non-numeric value:
                    <ul className="list-disc pl-5">{examples((r) => r.status === "invalid", (r) => `${r.label} (${r.detail})`).map((e) => <li key={e}>{e}</li>)}</ul></div>
                )}
                {series.counts.duplicate > 0 && (
                  <div className="text-sm text-danger-700"><strong>{series.counts.duplicate}</strong> duplicate row(s) will be ignored (the first one is kept):
                    <ul className="list-disc pl-5">{examples((r) => r.status === "duplicate", (r) => r.label).map((e) => <li key={e}>{e}</li>)}</ul></div>
                )}
                {series.counts.unmatched > 0 && (
                  <div className="text-sm text-danger-700"><strong>{series.counts.unmatched}</strong> region(s) were not found on the map and will not be shaded. Try a different &lsquo;Match regions by&rsquo; setting or check spellings:
                    <ul className="list-disc pl-5">{examples((r) => r.status === "ok" && r.region === "unmatched", (r) => r.label).map((e) => <li key={e}>{e}</li>)}</ul></div>
                )}
                {series.counts.badCoords > 0 && <p className="text-sm text-danger-700"><strong>{series.counts.badCoords}</strong> row(s) have missing or out-of-range coordinates (latitude -90 to 90, longitude -180 to 180) and will not get a symbol.</p>}
                {series.extraRowsForRegion > 0 && <p className="text-sm text-forest-700">{series.extraRowsForRegion} extra row(s) belong to a region that is already shaded; only the first is used for shading.</p>}
                {problems.map((p) => <Alert key={p} tone="error">{p}</Alert>)}
              </div>
            )}

            <div className="flex flex-wrap gap-3">
              <Button disabled={!canApply} onClick={() => draft && onApply(draft, cols.indicator)}>Apply to map</Button>
              <Button variant="secondary" onClick={onCancel}>Cancel</Button>
            </div>
          </>
        )}
      </CardBody>
    </Card>
  );
}
