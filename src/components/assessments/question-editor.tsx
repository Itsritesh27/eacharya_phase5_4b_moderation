"use client";

import { useRef, useState, useTransition } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { saveQuestionAction } from "@/lib/assessments/actions";
import type { EditorQuestion, Snapshot } from "@/lib/assessments/types";
import { fieldErrorsFrom, QUESTION_TYPE_LABEL, questionInputSchema } from "@/lib/assessments/validation";
import type { QuestionType } from "@/types/app";
import { Hint, numberOrNull, Textarea } from "./form-controls";

interface Props {
  assessmentId: string;
  /** Existing question to edit, or null to create one of `type`. */
  question: EditorQuestion | null;
  type: QuestionType;
  onSaved: (snapshot: Snapshot, questionId: string) => void;
  onCancel: () => void;
}

interface OptionDraft {
  text: string;
  isCorrect: boolean;
}

export function QuestionEditor({ assessmentId, question, type, onSaved, onCancel }: Props) {
  const isChoice = type === "single_choice" || type === "multiple_select";

  const [text, setText] = useState(question?.text ?? "");
  const [marks, setMarks] = useState(question ? String(question.marks) : "1");
  const [options, setOptions] = useState<OptionDraft[]>(
    question?.options.length
      ? question.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect }))
      : isChoice
        ? [
            { text: "", isCorrect: false },
            { text: "", isCorrect: false },
          ]
        : [],
  );
  const [correctBoolean, setCorrectBoolean] = useState<boolean | null>(question?.correctBoolean ?? null);
  const [accepted, setAccepted] = useState((question?.acceptedAnswers ?? []).join("\n"));
  const [caseSensitive, setCaseSensitive] = useState(question?.caseSensitive ?? false);
  const [explanation, setExplanation] = useState(question?.explanation ?? "");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const firstRef = useRef<HTMLTextAreaElement>(null);

  function setCorrect(index: number, checked: boolean) {
    setOptions((prev) =>
      prev.map((o, i) =>
        type === "single_choice" ? { ...o, isCorrect: i === index } : i === index ? { ...o, isCorrect: checked } : o,
      ),
    );
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const input = {
      ...(question ? { id: question.id } : {}),
      assessmentId,
      type,
      text,
      marks: numberOrNull(marks),
      explanation,
      options: options.map((o) => ({ text: o.text })),
      correctIndexes: options.flatMap((o, i) => (o.isCorrect ? [i] : [])),
      correctBoolean,
      acceptedAnswers: accepted.split("\n"),
      caseSensitive,
    };

    const check = questionInputSchema.safeParse(input);
    if (!check.success) {
      setErrors(fieldErrorsFrom(check.error));
      firstRef.current?.focus();
      return;
    }
    setErrors({});

    startTransition(async () => {
      const res = await saveQuestionAction(input);
      if (res.ok) onSaved(res.snapshot, res.questionId);
      else {
        setErrors(res.fieldErrors ?? {});
        setFormError(res.error);
      }
    });
  }

  const aria = (k: string) => ({
    "aria-invalid": errors[k] ? true : undefined,
    "aria-describedby": errors[k] ? `q-${k}-error` : undefined,
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5 rounded-card border border-brand-300 bg-white p-5 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-bold">
          {question ? "Edit question" : "New question"}{" "}
          <span className="ml-1 rounded-pill bg-sage-100 px-2.5 py-0.5 align-middle text-xs font-semibold text-forest-700">
            {QUESTION_TYPE_LABEL[type]}
          </span>
        </h3>
      </div>

      {formError && <Alert tone="error">{formError}</Alert>}

      <div>
        <Label htmlFor="q-text">Question</Label>
        <Textarea id="q-text" ref={firstRef} rows={3} value={text} onChange={(e) => setText(e.target.value)} {...aria("text")} />
        <FieldError id="q-text-error" message={errors.text} />
      </div>

      <div className="max-w-[10rem]">
        <Label htmlFor="q-marks">Marks</Label>
        <Input id="q-marks" type="number" inputMode="decimal" min={0} step="0.25" value={marks} onChange={(e) => setMarks(e.target.value)} {...aria("marks")} />
        <FieldError id="q-marks-error" message={errors.marks} />
      </div>

      {isChoice && (
        <fieldset className="space-y-2.5" aria-describedby="q-options-hint">
          <legend className="mb-1.5 text-sm font-medium text-forest-800">Options</legend>
          <Hint id="q-options-hint">
            {type === "single_choice"
              ? "Add 2 to 10 options and mark the one correct answer."
              : "Add 2 to 10 options and mark every correct answer."}
          </Hint>
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type={type === "single_choice" ? "radio" : "checkbox"}
                name="correct-option"
                checked={o.isCorrect}
                onChange={(e) => setCorrect(i, e.target.checked)}
                aria-label={`Option ${i + 1} is correct`}
                className="h-4 w-4 shrink-0 accent-brand-600"
              />
              <Input
                value={o.text}
                onChange={(e) => setOptions((prev) => prev.map((p, j) => (j === i ? { ...p, text: e.target.value } : p)))}
                aria-label={`Option ${i + 1} text`}
                placeholder={`Option ${i + 1}`}
                maxLength={1000}
              />
              <Button
                variant="ghost"
                size="sm"
                aria-label={`Remove option ${i + 1}`}
                disabled={options.length <= 2}
                onClick={() => setOptions((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          ))}
          <FieldError id="q-options-error" message={errors.options} />
          <FieldError id="q-correct-error" message={errors.correct} />
          <Button
            variant="secondary"
            size="sm"
            disabled={options.length >= 10}
            onClick={() => setOptions((prev) => [...prev, { text: "", isCorrect: false }])}
          >
            <Plus className="h-4 w-4" aria-hidden /> Add option
          </Button>
        </fieldset>
      )}

      {type === "true_false" && (
        <fieldset>
          <legend className="mb-1.5 text-sm font-medium text-forest-800">Correct answer</legend>
          <div className="flex gap-5">
            {([true, false] as const).map((v) => (
              <label key={String(v)} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="correct-boolean"
                  checked={correctBoolean === v}
                  onChange={() => setCorrectBoolean(v)}
                  className="h-4 w-4 accent-brand-600"
                />
                {v ? "True" : "False"}
              </label>
            ))}
          </div>
          <FieldError id="q-correctBoolean-error" message={errors.correctBoolean} />
        </fieldset>
      )}

      {type === "short_answer" && (
        <div className="space-y-3">
          <div>
            <Label htmlFor="q-accepted">Accepted answers</Label>
            <Textarea id="q-accepted" rows={3} value={accepted} onChange={(e) => setAccepted(e.target.value)} {...aria("acceptedAnswers")} />
            <Hint>One accepted answer per line. Extra spaces at the ends are ignored.</Hint>
            <FieldError id="q-acceptedAnswers-error" message={errors.acceptedAnswers} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Match capital letters exactly
          </label>
        </div>
      )}

      {type === "descriptive" && (
        <p className="rounded-xl bg-sage-50 px-3.5 py-2.5 text-sm text-forest-600">
          Long answers are marked by hand, so there is no answer key to set.
        </p>
      )}

      <div>
        <Label htmlFor="q-explanation">Explanation (optional)</Label>
        <Textarea id="q-explanation" rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} {...aria("explanation")} />
        <Hint>Shown to students only after they submit, never during the test.</Hint>
        <FieldError id="q-explanation-error" message={errors.explanation} />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : question ? "Save question" : "Add question"}
        </Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
