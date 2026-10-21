import type { PreviewQuestion } from "@/lib/assessments/types";
import { Card, CardBody } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "./form-controls";

/**
 * Read-only student view. It only receives PreviewQuestion, which has no answer
 * information, so a key cannot leak through this component.
 */
export function StudentPreview({
  title,
  description,
  instructions,
  durationMinutes,
  totalMarks,
  questions,
}: {
  title: string;
  description: string;
  instructions: string;
  durationMinutes: number | null;
  totalMarks: number;
  questions: PreviewQuestion[];
}) {
  return (
    <div className="space-y-4">
      <p className="rounded-xl bg-sage-50 px-3.5 py-2.5 text-sm text-forest-600">
        This is how students will see the assessment. Inputs are disabled in the preview.
      </p>
      <Card>
        <CardBody>
          <h2 className="text-xl font-extrabold">{title || "Untitled assessment"}</h2>
          {description && <p className="mt-1 text-forest-600">{description}</p>}
          <p className="mt-3 text-sm font-medium text-forest-700">
            {questions.length} {questions.length === 1 ? "question" : "questions"} · {questions.length === 0 ? 0 : totalMarks} marks
            {durationMinutes ? ` · ${durationMinutes} minutes` : ""}
          </p>
          {instructions && (
            <div className="mt-4 rounded-xl border border-sage-200 bg-sand-50 p-4">
              <h3 className="text-sm font-bold">Instructions</h3>
              <p className="mt-1 whitespace-pre-line text-sm text-forest-700">{instructions}</p>
            </div>
          )}
        </CardBody>
      </Card>

      {questions.length === 0 ? (
        <p className="text-sm text-forest-600">No questions yet.</p>
      ) : (
        <ol className="space-y-4">
          {questions.map((q, i) => (
            <li key={q.id}>
              <Card>
                <CardBody className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="whitespace-pre-line font-medium">
                      <span className="mr-2 text-forest-500">{i + 1}.</span>
                      {q.text}
                    </p>
                    <span className="shrink-0 text-xs font-semibold text-forest-600">
                      {q.marks} {q.marks === 1 ? "mark" : "marks"}
                    </span>
                  </div>
                  <Answer q={q} />
                </CardBody>
              </Card>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function Answer({ q }: { q: PreviewQuestion }) {
  if (q.type === "single_choice" || q.type === "multiple_select") {
    const kind = q.type === "single_choice" ? "radio" : "checkbox";
    return (
      <fieldset disabled>
        <legend className="sr-only">{q.type === "single_choice" ? "Choose one" : "Choose all that apply"}</legend>
        <p className="mb-2 text-xs text-forest-600">{q.type === "single_choice" ? "Choose one answer." : "Choose all that apply."}</p>
        <div className="space-y-2">
          {q.options.map((o) => (
            <label key={o.id} className="flex items-center gap-2.5 rounded-xl border border-sage-200 px-3 py-2 text-sm">
              <input type={kind} name={`preview-${q.id}`} className="h-4 w-4 accent-brand-600" />
              {o.text}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (q.type === "true_false") {
    return (
      <fieldset disabled className="flex gap-3">
        <legend className="sr-only">True or false</legend>
        {["True", "False"].map((label) => (
          <label key={label} className="flex items-center gap-2.5 rounded-xl border border-sage-200 px-4 py-2 text-sm">
            <input type="radio" name={`preview-${q.id}`} className="h-4 w-4 accent-brand-600" />
            {label}
          </label>
        ))}
      </fieldset>
    );
  }
  if (q.type === "short_answer") {
    return <Input disabled aria-label="Your answer" placeholder="Type your answer" />;
  }
  return <Textarea disabled rows={5} aria-label="Your answer" placeholder="Write your answer" />;
}
