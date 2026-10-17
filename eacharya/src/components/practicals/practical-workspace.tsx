"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, Circle, Clock, Eraser, Map as MapIcon, Save, Send } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { draftKey, parseDraft, serializeDraft } from "@/lib/practicals/draft";
import { MIN_CONCLUSION, MIN_INTERPRETATION, MIN_REFLECTION, checkMeasurement, computeProgress } from "@/lib/practicals/progress";
import { emptyState, reliefSummary } from "@/lib/practicals/rows";
import { fmt } from "@/lib/practicals/scale";
import { TEXT_LIMIT, type Practical, type WorkspaceState } from "@/lib/practicals/types";
import { DensityCalculator } from "./density-calculator";
import { TextAreaField, TextField } from "./fields";
import { ObservationTable } from "./observation-table";
import { ScaleCalculator } from "./scale-calculator";
import { WeatherLog } from "./weather-log";

// The existing Map Explorer is reused as-is; it is only loaded when the student opens it.
const MapExplorer = dynamic(() => import("@/components/geography-lab/map-explorer").then((m) => m.MapExplorer), {
  ssr: false,
  loading: () => <Skeleton className="h-96 w-full" />,
});

type SaveState = { kind: "idle" } | { kind: "saved"; at: string } | { kind: "error"; message: string };

const DEVICE_NOTE = "Your work is kept only in this browser on this device. It is not uploaded, your teacher cannot see it, and it is lost if you clear site data.";

export function PracticalWorkspace({ practical, userId }: { practical: Practical; userId: string | null }) {
  const key = draftKey(practical.id, userId);
  const [state, setState] = useState<WorkspaceState>(() => emptyState(practical));
  const [restored, setRestored] = useState<string | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [showMap, setShowMap] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const dirty = useRef(false);
  const ready = useRef(false);

  // Restore a device draft after mount (never during render, so server and client markup match).
  useEffect(() => {
    try {
      const d = parseDraft(window.localStorage.getItem(key), practical);
      if (d) { setState(d.state); setRestored(d.savedAt ?? "earlier"); }
    } catch {
      setSave({ kind: "error", message: "This browser is blocking local storage, so a draft cannot be kept on this device." });
    }
    ready.current = true;
  }, [key, practical]);

  const writeDraft = useCallback((s: WorkspaceState) => {
    try {
      window.localStorage.setItem(key, serializeDraft(s));
      setSave({ kind: "saved", at: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) });
    } catch {
      setSave({ kind: "error", message: "The draft could not be saved on this device (storage is full or blocked). Copy your text somewhere safe." });
    }
  }, [key]);

  // Debounced autosave, only after the student has actually changed something.
  useEffect(() => {
    if (!ready.current || !dirty.current) return;
    const t = setTimeout(() => writeDraft(state), 800);
    return () => clearTimeout(t);
  }, [state, writeDraft]);

  const update = useCallback((patch: Partial<WorkspaceState>) => {
    dirty.current = true;
    setConfirmClear(false);
    setState((s) => ({ ...s, ...patch }));
  }, []);

  function clearDraft() {
    try { window.localStorage.removeItem(key); } catch { /* nothing to remove */ }
    dirty.current = false;
    setState(emptyState(practical));
    setRestored(null);
    setSave({ kind: "idle" });
    setConfirmClear(false);
  }

  const progress = useMemo(() => computeProgress(practical, state), [practical, state]);
  const relief = practical.calculator === "relief" && practical.reliefColumn ? reliefSummary(state.rows, practical.reliefColumn) : null;

  return (
    <div className="space-y-8">
      <header>
        <Link href="/geography-lab/practicals" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Practical activities
        </Link>
        <p className="mt-3 text-sm font-semibold text-brand-700">Class {practical.grade} · {practical.topic} · {practical.difficulty}</p>
        <h1 className="mt-1 text-3xl font-extrabold sm:text-4xl">{practical.title}</h1>
        <p className="mt-2 flex items-center gap-2 text-forest-600"><Clock className="h-4 w-4" aria-hidden /> About {practical.minutes} minutes · illustrative activity, not formally approved curriculum content</p>
      </header>

      <Card>
        <CardBody className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-forest-950">Your progress</h2>
            <p className="text-sm font-semibold text-forest-800">{progress.done} of {progress.total} parts complete ({progress.percent}%)</p>
          </div>
          <div role="progressbar" aria-label="Activity progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress.percent} className="h-2.5 overflow-hidden rounded-pill bg-sage-100">
            <div className="h-full rounded-pill bg-brand-600 transition-[width]" style={{ width: `${progress.percent}%` }} />
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer font-semibold text-brand-700">What is still to do</summary>
            <ul className="mt-2 space-y-1.5">
              {progress.items.map((i) => (
                <li key={i.id} className="flex items-start gap-2">
                  {i.done ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" aria-label="Done" /> : <Circle className="mt-0.5 h-4 w-4 shrink-0 text-forest-500" aria-label="Not done" />}
                  <span>{i.label}{!i.done && i.hint ? <span className="text-forest-600"> – {i.hint}</span> : null}</span>
                </li>
              ))}
            </ul>
          </details>
        </CardBody>
      </Card>

      <section aria-labelledby="obj-h" className="grid gap-6 md:grid-cols-2">
        <div>
          <h2 id="obj-h" className="text-xl font-bold">Learning objectives</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-forest-800">{practical.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
        </div>
        <div>
          <h2 className="text-xl font-bold">Materials required</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-forest-800">{practical.materials.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      </section>

      <section aria-labelledby="proc-h">
        <h2 id="proc-h" className="text-xl font-bold">Procedure</h2>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-forest-800">{practical.steps.map((s) => <li key={s}>{s}</li>)}</ol>
        {practical.usesMapExplorer && (
          <div className="mt-4 space-y-3">
            <Button variant="secondary" aria-expanded={showMap} onClick={() => setShowMap((v) => !v)}>
              <MapIcon className="h-4 w-4" aria-hidden /> {showMap ? "Hide the Map Explorer" : "Open the Map Explorer here"}
            </Button>
            {showMap && <MapExplorer />}
          </div>
        )}
      </section>

      {practical.measurements.length > 0 && (
        <section aria-labelledby="meas-h">
          <h2 id="meas-h" className="text-xl font-bold">Measurements</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {practical.measurements.map((f) => {
              const v = state.measurements[f.key] ?? "";
              return (
                <TextField
                  key={f.key}
                  label={`${f.label}${f.unit ? ` (${f.unit})` : ""}`}
                  hint={f.hint}
                  inputMode={f.kind === "scale" ? "text" : "decimal"}
                  autoComplete="off"
                  maxLength={40}
                  value={v}
                  error={v.trim() !== "" ? checkMeasurement(f, v) : null}
                  onChange={(nv) =>
                    update({
                      measurements: { ...state.measurements, [f.key]: nv },
                      // keep the calculator in step with the activity's scale until the student edits it separately
                      ...(f.key === "scale" && practical.calculator === "scale" ? { scale: { ...state.scale, scale: nv } } : {}),
                    })
                  }
                />
              );
            })}
          </div>
        </section>
      )}

      {practical.table && (
        <section aria-labelledby="tbl-h">
          <h2 id="tbl-h" className="text-xl font-bold">Observation table: {practical.table.caption}</h2>
          <div className="mt-3">
            <ObservationTable spec={practical.table} rows={state.rows} measurements={state.measurements} onChange={(rows) => update({ rows })} />
          </div>
        </section>
      )}

      {practical.calculator && (
        <section aria-labelledby="calc-h">
          <h2 id="calc-h" className="text-xl font-bold">Calculation</h2>
          <div className="mt-3">
            {practical.calculator === "scale" && <ScaleCalculator value={state.scale} onChange={(scale) => update({ scale })} />}
            {practical.calculator === "density" && <DensityCalculator value={state.density} onChange={(density) => update({ density })} />}
            {practical.calculator === "weather" && <WeatherLog observations={state.weather} onChange={(weather) => update({ weather })} persistence="Saved only on this device." />}
            {practical.calculator === "relief" && (
              <Card><CardBody>
                <h3 className="text-lg font-bold text-forest-950">Relief summary</h3>
                {relief ? (
                  <dl className="mt-3 grid gap-3 sm:grid-cols-3" aria-live="polite">
                    <div><dt className="text-xs font-semibold text-forest-700">Highest point</dt><dd className="text-lg font-bold text-brand-800">{fmt(relief.highest)} m</dd></div>
                    <div><dt className="text-xs font-semibold text-forest-700">Lowest point</dt><dd className="text-lg font-bold text-brand-800">{fmt(relief.lowest)} m</dd></div>
                    <div><dt className="text-xs font-semibold text-forest-700">Relief (highest − lowest)</dt><dd className="text-lg font-bold text-brand-800">{fmt(relief.relief)} m</dd></div>
                  </dl>
                ) : <p className="mt-1 text-sm text-forest-600">Enter at least two valid heights in the table to see the relief.</p>}
              </CardBody></Card>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="write-h" className="space-y-5">
        <h2 id="write-h" className="text-xl font-bold">Interpretation, conclusion and reflection</h2>
        <TextAreaField label="Geographical interpretation" hint={practical.interpretationPrompt} value={state.interpretation} maxLength={TEXT_LIMIT} minLength={MIN_INTERPRETATION} onChange={(interpretation) => update({ interpretation })} />
        <TextAreaField label="Conclusion" hint="State what your results show, in one or two sentences." rows={3} value={state.conclusion} maxLength={TEXT_LIMIT} minLength={MIN_CONCLUSION} onChange={(conclusion) => update({ conclusion })} />
        <TextAreaField label="Reflection" hint="What went well, what was difficult, and what would you do differently?" rows={3} value={state.reflection} maxLength={TEXT_LIMIT} minLength={MIN_REFLECTION} onChange={(reflection) => update({ reflection })} />
      </section>

      <Card>
        <CardBody className="space-y-4">
          <h2 className="text-lg font-bold text-forest-950">Save and submit</h2>
          {restored && <Alert tone="success">Your earlier draft from this device was restored.</Alert>}
          {save.kind === "error" && <Alert tone="error">{save.message}</Alert>}
          {save.kind === "saved" && <Alert tone="success">Draft saved on this device at {save.at}.</Alert>}
          <p className="text-sm text-forest-700">{DEVICE_NOTE}</p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => { dirty.current = true; writeDraft(state); }}><Save className="h-4 w-4" aria-hidden /> Save draft on this device</Button>
            {confirmClear ? (
              <>
                <Button variant="danger" onClick={clearDraft}>Yes, erase my work</Button>
                <Button variant="ghost" onClick={() => setConfirmClear(false)}>Cancel</Button>
              </>
            ) : (
              <Button variant="secondary" onClick={() => setConfirmClear(true)}><Eraser className="h-4 w-4" aria-hidden /> Clear this draft</Button>
            )}
            <Button variant="secondary" disabled aria-describedby="submit-note"><Send className="h-4 w-4" aria-hidden /> Submit to teacher (not available yet)</Button>
          </div>
          <p id="submit-note" className="text-sm text-forest-600">
            Submitting to a teacher needs server storage that has not been set up, so nothing you do here is sent anywhere.
            {progress.complete ? " Your work is complete: keep this draft and show your teacher directly." : ""}
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
