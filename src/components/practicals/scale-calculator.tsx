"use client";

import { useMemo } from "react";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { mapToGround, fmt } from "@/lib/practicals/scale";
import type { WorkspaceState } from "@/lib/practicals/types";
import { SelectField, TextField } from "./fields";

export function ScaleCalculator({ value, onChange }: { value: WorkspaceState["scale"]; onChange: (v: WorkspaceState["scale"]) => void }) {
  const touched = value.distance.trim() !== "" || value.scale.trim() !== "";
  const result = useMemo(() => mapToGround(value.distance, value.unit, value.scale), [value]);
  const error = touched && !result.ok ? result.error : null;
  return (
    <Card>
      <CardBody className="space-y-4">
        <div>
          <h3 className="text-lg font-bold text-forest-950">Map Scale Calculator</h3>
          <p className="mt-1 text-sm text-forest-600">Ground distance = map distance × scale denominator. Example: 4 cm on a 1:50,000 map is 200,000 cm = 2 km.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField label="Map distance" inputMode="decimal" autoComplete="off" value={value.distance} onChange={(distance) => onChange({ ...value, distance })} />
          <SelectField label="Unit" value={value.unit} onChange={(unit) => onChange({ ...value, unit })} options={[{ value: "mm", label: "millimetres (mm)" }, { value: "cm", label: "centimetres (cm)" }, { value: "m", label: "metres (m)" }]} />
          <TextField label="Scale (representative fraction)" placeholder="1:50,000" autoComplete="off" value={value.scale} onChange={(scale) => onChange({ ...value, scale })} />
        </div>
        <div aria-live="polite">
          {error && <Alert tone="error">{error}</Alert>}
          {result.ok && (
            <div className="rounded-xl border border-brand-300 bg-brand-50 p-4">
              <p className="text-lg font-bold text-brand-800">Ground distance: {fmt(result.value.groundKm, 3)} km <span className="font-medium text-forest-700">({fmt(result.value.groundMetres, 1)} m)</span></p>
              <h4 className="mt-3 text-sm font-semibold text-forest-900">Steps</h4>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-forest-800">
                {result.value.steps.map((s) => <li key={s}>{s}</li>)}
              </ol>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
