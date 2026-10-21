"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { FieldError, Input, Label } from "@/components/ui/input";
import { createAssessmentAction, updateAssessmentAction } from "@/lib/assessments/actions";
import type { CourseOption, EditorAssessment } from "@/lib/assessments/types";
import {
  assessmentSettingsSchema,
  createAssessmentSchema,
  fieldErrorsFrom,
} from "@/lib/assessments/validation";
import { fromLocalInput, Hint, numberOrNull, Select, Textarea, toLocalInput } from "./form-controls";

type Props =
  | { mode: "create"; courses: CourseOption[] }
  | {
      mode: "edit";
      formId: string;
      assessment: EditorAssessment;
      units: CourseOption["units"];
      locked: boolean;
      hasQuestions: boolean;
      onSaved: (patch: { title: string; passingMarks: number | null; updatedAt: string }) => void;
    };

export function SettingsForm(props: Props) {
  const router = useRouter();
  const editing = props.mode === "edit";
  const a = editing ? props.assessment : null;

  const [title, setTitle] = useState(a?.title ?? "");
  const [courseId, setCourseId] = useState(props.mode === "create" ? (props.courses[0]?.id ?? "") : "");
  const [unitId, setUnitId] = useState(a?.unitId ?? "");
  const [description, setDescription] = useState(a?.description ?? "");
  const [instructions, setInstructions] = useState(a?.instructions ?? "");
  const [duration, setDuration] = useState(a?.durationMinutes ? String(a.durationMinutes) : "");
  const [passing, setPassing] = useState(a?.passingMarks != null ? String(a.passingMarks) : "");
  const [attempts, setAttempts] = useState(a?.attemptLimit != null ? String(a.attemptLimit) : "");
  const [opensAt, setOpensAt] = useState(toLocalInput(a?.opensAt ?? null));
  const [closesAt, setClosesAt] = useState(toLocalInput(a?.closesAt ?? null));

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  const units =
    props.mode === "create"
      ? (props.courses.find((c) => c.id === courseId)?.units ?? [])
      : props.units;
  const selectedCourse = props.mode === "create" ? props.courses.find((c) => c.id === courseId) : null;
  const disabled = editing ? props.locked : false;
  const passingDisabled = disabled || (editing && !props.hasQuestions);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setSaved(false);

    const common = {
      title,
      description,
      instructions,
      unitId: unitId === "" ? null : unitId,
      durationMinutes: numberOrNull(duration),
      attemptLimit: numberOrNull(attempts),
      opensAt: fromLocalInput(opensAt),
      closesAt: fromLocalInput(closesAt),
    };

    if (props.mode === "create") {
      const input = { ...common, courseId };
      const check = createAssessmentSchema.safeParse(input);
      if (!check.success) {
        setErrors(fieldErrorsFrom(check.error));
        return;
      }
      setErrors({});
      startTransition(async () => {
        const res = await createAssessmentAction(input);
        if (res.ok) router.push(`/dashboard/teacher/assessments/${res.id}?created=1`);
        else {
          setErrors(res.fieldErrors ?? {});
          setFormError(res.error);
        }
      });
      return;
    }

    const input = { ...common, passingMarks: numberOrNull(passing) };
    const check = assessmentSettingsSchema.safeParse(input);
    if (!check.success) {
      setErrors(fieldErrorsFrom(check.error));
      return;
    }
    setErrors({});
    startTransition(async () => {
      const res = await updateAssessmentAction(props.assessment.id, input);
      if (res.ok) {
        setSaved(true);
        props.onSaved({ title: check.data.title, passingMarks: check.data.passingMarks, updatedAt: res.updatedAt });
        router.refresh();
      } else {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.error);
      }
    });
  }

  const err = (k: string) => errors[k];
  const aria = (k: string) => ({
    "aria-invalid": err(k) ? true : undefined,
    "aria-describedby": err(k) ? `${k}-error` : undefined,
  });

  return (
    <form id={editing ? props.formId : undefined} onSubmit={submit} noValidate className="space-y-5">
      {formError && <Alert tone="error">{formError}</Alert>}
      {saved && <Alert tone="success">Draft saved.</Alert>}
      {disabled && (
        <Alert tone="error">This assessment is published, so its settings are locked. Move it back to draft to edit.</Alert>
      )}

      <div>
        <Label htmlFor="title">Assessment title</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={disabled} maxLength={200} {...aria("title")} />
        <FieldError id="title-error" message={err("title")} />
      </div>

      {props.mode === "create" ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="courseId">Course</Label>
            <Select
              id="courseId"
              value={courseId}
              onChange={(e) => {
                setCourseId(e.target.value);
                setUnitId("");
              }}
              {...aria("courseId")}
            >
              {props.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.grade ? `Class ${c.grade} · ` : ""}
                  {c.title}
                </option>
              ))}
            </Select>
            <Hint>
              {selectedCourse?.grade
                ? `This assessment is for Class ${selectedCourse.grade}. The course cannot be changed after creation.`
                : "The course cannot be changed after creation."}
            </Hint>
            <FieldError id="courseId-error" message={err("courseId")} />
          </div>
          <UnitSelect units={units} value={unitId} onChange={setUnitId} disabled={disabled} error={err("unitId")} />
        </div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <Label htmlFor="course-readonly">Course</Label>
            <Input
              id="course-readonly"
              readOnly
              disabled
              value={`${props.assessment.grade ? `Class ${props.assessment.grade} · ` : ""}${props.assessment.courseTitle}`}
            />
            <Hint>The course is fixed once an assessment is created.</Hint>
          </div>
          <UnitSelect units={units} value={unitId} onChange={setUnitId} disabled={disabled} error={err("unitId")} />
        </div>
      )}

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} disabled={disabled} {...aria("description")} />
        <FieldError id="description-error" message={err("description")} />
      </div>

      <div>
        <Label htmlFor="instructions">Instructions for students</Label>
        <Textarea id="instructions" rows={5} value={instructions} onChange={(e) => setInstructions(e.target.value)} disabled={disabled} {...aria("instructions")} />
        <FieldError id="instructions-error" message={err("instructions")} />
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <Label htmlFor="durationMinutes">Duration (minutes)</Label>
          <Input id="durationMinutes" type="number" inputMode="numeric" min={1} max={600} value={duration} onChange={(e) => setDuration(e.target.value)} disabled={disabled} {...aria("durationMinutes")} />
          <FieldError id="durationMinutes-error" message={err("durationMinutes")} />
        </div>
        <div>
          <Label htmlFor="attemptLimit">Attempts allowed</Label>
          <Input id="attemptLimit" type="number" inputMode="numeric" min={1} max={50} placeholder="Unlimited" value={attempts} onChange={(e) => setAttempts(e.target.value)} disabled={disabled} {...aria("attemptLimit")} />
          <Hint>Leave blank for unlimited.</Hint>
          <FieldError id="attemptLimit-error" message={err("attemptLimit")} />
        </div>
        {editing && (
          <div>
            <Label htmlFor="passingMarks">Passing marks</Label>
            <Input id="passingMarks" type="number" inputMode="decimal" min={0} step="0.25" value={passing} onChange={(e) => setPassing(e.target.value)} disabled={passingDisabled} {...aria("passingMarks")} />
            <Hint>{props.hasQuestions ? "Optional. Cannot exceed total marks." : "Add questions first."}</Hint>
            <FieldError id="passingMarks-error" message={err("passingMarks")} />
          </div>
        )}
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <Label htmlFor="opensAt">Opens (optional)</Label>
          <Input id="opensAt" type="datetime-local" value={opensAt} onChange={(e) => setOpensAt(e.target.value)} disabled={disabled} {...aria("opensAt")} />
          <FieldError id="opensAt-error" message={err("opensAt")} />
        </div>
        <div>
          <Label htmlFor="closesAt">Closes (optional)</Label>
          <Input id="closesAt" type="datetime-local" value={closesAt} onChange={(e) => setClosesAt(e.target.value)} disabled={disabled} {...aria("closesAt")} />
          <FieldError id="closesAt-error" message={err("closesAt")} />
        </div>
      </div>

      {!disabled && (
        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : editing ? "Save draft" : "Create assessment"}
          </Button>
          {!editing && (
            <Button variant="ghost" onClick={() => router.push("/dashboard/teacher/assessments")}>
              Cancel
            </Button>
          )}
        </div>
      )}
    </form>
  );
}

function UnitSelect({
  units,
  value,
  onChange,
  disabled,
  error,
}: {
  units: CourseOption["units"];
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <div>
      <Label htmlFor="unitId">Unit (optional)</Label>
      <Select id="unitId" value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} aria-invalid={error ? true : undefined}>
        <option value="">Whole course</option>
        {units.map((u) => (
          <option key={u.id} value={u.id}>
            {u.title}
          </option>
        ))}
      </Select>
      <FieldError id="unitId-error" message={error} />
    </div>
  );
}
