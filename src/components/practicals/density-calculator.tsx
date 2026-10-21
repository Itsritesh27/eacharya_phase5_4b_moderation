"use client";

import { useMemo } from "react";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { populationDensity } from "@/lib/practicals/density";
import { fmt, tidy } from "@/lib/practicals/scale";
import type { WorkspaceState } from "@/lib/practicals/types";
import { SelectField, TextField } from "./fields";

export function DensityCalculator({ value, onChange }: { value: WorkspaceState["density"]; onChange: (v: WorkspaceState["density"]) => void }) {
  const touched = value.population.trim() !== "" || value.area.trim() !== "";
  const result = useMemo(() => populationDensity(value.population, value.area, value.unit), [value]);
  const error = touched && !result.ok ? result.error : null;
  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-forest-950">Population Density Calculator</h3>
          <p className="mt-1 text-sm text-forest-600">Population density = total population ÷ area (km²). The result is people per square kilometre.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Population (people)" inputMode="numeric" autoComplete="off" value={value.population} onChange={(population) => onChange({ ...value, population })} />
          <TextField label="Area" inputMode="decimal" autoComplete="off" value={value.area} onChange={(area) => onChange({ ...value, area })} />
          <SelectField label="Area unit" value={value.unit} onChange={(unit) => onChange({ ...value, unit })} options={[{ value: "km2", label: "square kilometres (km²)" }, { value: "ha", label: "hectares (ha)" }]} />
        </div>
        <div aria-live="polite">
          {error && <Alert tone="error">{error}</Alert>}
          {result.ok && (
            <div className="rounded-xl border border-brand-300 bg-brand-50 p-4">
              <p className="text-lg font-bold text-brand-800">{fmt(tidy(result.value.density, 2), 2)} people per km²</p>
              <p className="mt-1 text-sm text-forest-700">Formula: {result.value.formula}</p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-forest-800">
                {result.value.steps.map((s) => <li key={s}>{s}</li>)}
              </ol>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
