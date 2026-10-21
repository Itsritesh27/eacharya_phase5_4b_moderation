"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, Lock, Rocket, Trash2, Undo2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import {
  deleteAssessmentAction,
  deleteQuestionAction,
  publishAssessmentAction,
  reorderQuestionsAction,
  unpublishAssessmentAction,
} from "@/lib/assessments/actions";
import { getPublishIssues, moveItem, sumMarks, toPreviewQuestions } from "@/lib/assessments/publish";
import type { EditorAssessment, EditorQuestion, Snapshot, UnitOption } from "@/lib/assessments/types";
import { QUESTION_TYPE_LABEL } from "@/lib/assessments/validation";
import { cn } from "@/lib/utils/cn";
import type { AssessmentStatus, QuestionType } from "@/types/app";
import { QuestionEditor } from "./question-editor";
import { QuestionList } from "./question-list";
import { SettingsForm } from "./settings-form";
import { StatusBadge } from "./status-badge";
import { StudentPreview } from "./student-preview";

type Tab = "questions" | "settings" | "preview";
type Editing = { kind: "new"; type: QuestionType } | { kind: "edit"; id: string } | null;

const SETTINGS_FORM_ID = "assessment-settings-form";

export function AssessmentEditor({
  assessment,
  units,
  initialQuestions,
  created,
  openPublish,
  initialTab,
}: {
  assessment: EditorAssessment;
  units: UnitOption[];
  initialQuestions: EditorQuestion[];
  created: boolean;
  openPublish: boolean;
  initialTab: Tab;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(assessment.title);
  const [status, setStatus] = useState<AssessmentStatus>(assessment.status);
  const [totalMarks, setTotalMarks] = useState(assessment.totalMarks);
  const [passingMarks, setPassingMarks] = useState(assessment.passingMarks);
  const [questions, setQuestions] = useState(initialQuestions);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [editing, setEditing] = useState<Editing>(null);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(
    created ? { tone: "success", text: "Assessment created. Add your questions below." } : null,
  );
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const locked = status === "published";
  const count = questions.length;
  const marksShown = count === 0 ? 0 : sumMarks(questions);
  const issues = useMemo(() => getPublishIssues(questions, totalMarks), [questions, totalMarks]);
  const editingQuestion = editing?.kind === "edit" ? (questions.find((q) => q.id === editing.id) ?? null) : null;
  const typeCounts = useMemo(() => {
    const m = new Map<QuestionType, number>();
    questions.forEach((q) => m.set(q.type, (m.get(q.type) ?? 0) + 1));
    return [...m.entries()];
  }, [questions]);

  function applySnapshot(s: Snapshot) {
    setQuestions(s.questions);
    setTotalMarks(s.totalMarks);
    setPassingMarks(s.passingMarks);
  }

  // Arriving from the list's "Publish" link opens the confirmation straight away.
  useEffect(() => {
    if (openPublish && assessment.status === "draft") dialogRef.current?.showModal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function move(index: number, delta: -1 | 1) {
    const next = moveItem(questions, index, delta);
    if (!next) return;
    setNotice(null);
    startTransition(async () => {
      const res = await reorderQuestionsAction(assessment.id, next.map((q) => q.id));
      if (res.ok) applySnapshot(res.snapshot);
      else setNotice({ tone: "error", text: res.error });
    });
  }

  function remove(q: EditorQuestion) {
    if (!window.confirm("Delete this question? This cannot be undone.")) return;
    setNotice(null);
    startTransition(async () => {
      const res = await deleteQuestionAction(assessment.id, q.id);
      if (res.ok) {
        applySnapshot(res.snapshot);
        if (editing?.kind === "edit" && editing.id === q.id) setEditing(null);
        setNotice({ tone: "success", text: "Question deleted." });
      } else setNotice({ tone: "error", text: res.error });
    });
  }

  function publish() {
    startTransition(async () => {
      const res = await publishAssessmentAction(assessment.id);
      dialogRef.current?.close();
      if (res.ok) {
        setStatus("published");
        setEditing(null);
        setNotice({ tone: "success", text: "Assessment published. Enrolled students can now see it." });
        router.refresh();
      } else {
        setNotice({ tone: "error", text: res.error });
      }
    });
  }

  function backToDraft() {
    if (!window.confirm("Move this assessment back to draft? Students will no longer see it until you publish again.")) return;
    startTransition(async () => {
      const res = await unpublishAssessmentAction(assessment.id);
      if (res.ok) {
        setStatus("draft");
        setNotice({ tone: "success", text: "Moved back to draft. You can edit it now." });
        router.refresh();
      } else setNotice({ tone: "error", text: res.error });
    });
  }

  function deleteDraft() {
    if (!window.confirm("Delete this draft and all its questions? This cannot be undone.")) return;
    startTransition(async () => {
      const res = await deleteAssessmentAction(assessment.id);
      if (res.ok) router.push("/dashboard/teacher/assessments");
      else setNotice({ tone: "error", text: res.error });
    });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "questions", label: `Questions (${count})` },
    { id: "settings", label: "Settings" },
    { id: "preview", label: "Student preview" },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="truncate text-2xl font-extrabold">{title}</h1>
            <StatusBadge status={status} closesAt={assessment.closesAt} />
          </div>
          <p className="mt-1 text-sm text-forest-600">
            {assessment.grade ? `Class ${assessment.grade} · ` : ""}
            {assessment.courseTitle}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setTab("preview")}>
            <Eye className="h-4 w-4" aria-hidden /> Preview
          </Button>
          {locked ? (
            <Button variant="secondary" onClick={backToDraft} disabled={pending}>
              <Undo2 className="h-4 w-4" aria-hidden /> Move to draft
            </Button>
          ) : (
            <>
              <Button variant="secondary" type="submit" form={SETTINGS_FORM_ID} onClick={() => setTab("settings")} disabled={pending}>
                Save draft
              </Button>
              <Button onClick={() => dialogRef.current?.showModal()} disabled={pending}>
                <Rocket className="h-4 w-4" aria-hidden /> Publish
              </Button>
            </>
          )}
        </div>
      </div>

      {notice && (
        <div className="mb-5">
          <Alert tone={notice.tone}>{notice.text}</Alert>
        </div>
      )}

      {locked && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-sage-300 bg-sage-50 px-3.5 py-3 text-sm text-forest-700">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <p>This assessment is published, so its settings and questions are locked. Use “Move to draft” to edit it.</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          <div role="tablist" aria-label="Assessment sections" className="mb-5 flex gap-1 overflow-x-auto border-b border-sage-200">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                id={`tab-${t.id}`}
                aria-selected={tab === t.id}
                aria-controls={`panel-${t.id}`}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  "-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  tab === t.id ? "border-brand-600 text-brand-800" : "border-transparent text-forest-600 hover:text-forest-900",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div role="tabpanel" id="panel-questions" aria-labelledby="tab-questions" hidden={tab !== "questions"} className="space-y-5">
            {count === 0 && !editing && (
              <p className="rounded-card border border-dashed border-sage-300 bg-sage-50/60 px-5 py-8 text-center text-sm text-forest-600">
                No questions yet. Choose a question type below to add your first one.
              </p>
            )}
            <QuestionList
              questions={questions}
              selectedId={editing?.kind === "edit" ? editing.id : null}
              locked={locked}
              busy={pending}
              onSelect={(id) => setEditing({ kind: "edit", id })}
              onMove={move}
              onDelete={remove}
              onAdd={(type) => {
                setNotice(null);
                setEditing({ kind: "new", type });
              }}
            />
            {!locked && editing && (
              <QuestionEditor
                key={editing.kind === "edit" ? editing.id : `new-${editing.type}`}
                assessmentId={assessment.id}
                question={editingQuestion}
                type={editing.kind === "new" ? editing.type : (editingQuestion?.type ?? "descriptive")}
                onSaved={(s) => {
                  applySnapshot(s);
                  setEditing(null);
                  setNotice({ tone: "success", text: "Question saved." });
                }}
                onCancel={() => setEditing(null)}
              />
            )}
          </div>

          {/* Kept mounted (just hidden) so the header's "Save draft" can always submit it. */}
          <div role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" hidden={tab !== "settings"}>
            <Card>
              <CardBody>
                <SettingsForm
                  mode="edit"
                  formId={SETTINGS_FORM_ID}
                  assessment={assessment}
                  units={units}
                  locked={locked}
                  hasQuestions={count > 0}
                  onSaved={(p) => {
                    setTitle(p.title);
                    setPassingMarks(p.passingMarks);
                  }}
                />
              </CardBody>
            </Card>
          </div>

          <div role="tabpanel" id="panel-preview" aria-labelledby="tab-preview" hidden={tab !== "preview"}>
            <StudentPreview
              title={title}
              description={assessment.description}
              instructions={assessment.instructions}
              durationMinutes={assessment.durationMinutes}
              totalMarks={marksShown}
              questions={toPreviewQuestions(questions)}
            />
          </div>
        </div>

        <aside aria-label="Assessment summary" className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardBody className="space-y-4 p-5 sm:p-5">
              <h2 className="text-sm font-bold uppercase tracking-wide text-forest-600">Summary</h2>
              <dl className="grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-xs text-forest-600">Questions</dt>
                  <dd className="text-2xl font-extrabold">{count}</dd>
                </div>
                <div>
                  <dt className="text-xs text-forest-600">Total marks</dt>
                  <dd className="text-2xl font-extrabold">{marksShown}</dd>
                </div>
                {passingMarks !== null && (
                  <div className="col-span-2">
                    <dt className="text-xs text-forest-600">Passing marks</dt>
                    <dd className="font-semibold">{passingMarks}</dd>
                  </div>
                )}
              </dl>
              {typeCounts.length > 0 && (
                <ul className="space-y-1 text-sm text-forest-700">
                  {typeCounts.map(([t, n]) => (
                    <li key={t} className="flex justify-between">
                      <span>{QUESTION_TYPE_LABEL[t]}</span>
                      <span className="font-semibold">{n}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!locked && (
                <div className="border-t border-sage-100 pt-3 text-sm">
                  {issues.length === 0 ? (
                    <p className="flex items-center gap-2 font-medium text-brand-700">
                      <CheckCircle2 className="h-4 w-4" aria-hidden /> Ready to publish
                    </p>
                  ) : (
                    <>
                      <p className="mb-1.5 font-semibold text-forest-800">Before you can publish</p>
                      <ul className="list-disc space-y-1 pl-5 text-forest-700">
                        {issues.slice(0, 4).map((m) => (
                          <li key={m}>{m}</li>
                        ))}
                        {issues.length > 4 && <li>…and {issues.length - 4} more</li>}
                      </ul>
                    </>
                  )}
                </div>
              )}
              {!locked && (
                <Button variant="ghost" size="sm" className="w-full text-danger-600" onClick={deleteDraft} disabled={pending}>
                  <Trash2 className="h-4 w-4" aria-hidden /> Delete draft
                </Button>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>

      <dialog
        ref={dialogRef}
        aria-labelledby="publish-title"
        className="w-[min(32rem,calc(100vw-2rem))] rounded-card border border-sage-200 bg-white p-0 shadow-lift backdrop:bg-forest-950/50"
      >
        <div className="space-y-4 p-6">
          <h2 id="publish-title" className="text-lg font-extrabold">
            Publish this assessment?
          </h2>
          {issues.length === 0 ? (
            <>
              <p className="text-sm text-forest-700">
                <strong>{count}</strong> {count === 1 ? "question" : "questions"} · <strong>{marksShown}</strong> total marks
                {assessment.durationMinutes ? ` · ${assessment.durationMinutes} minutes` : ""}.
              </p>
              <p className="text-sm text-forest-600">
                Students enrolled in this course will be able to see it. While it is published, settings and questions are
                locked; you can move it back to draft to edit.
              </p>
            </>
          ) : (
            <div>
              <p className="mb-1.5 text-sm font-semibold text-danger-700">Fix these first:</p>
              <ul className="list-disc space-y-1 pl-5 text-sm text-forest-700">
                {issues.map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex justify-end gap-3 pt-1">
            <Button variant="ghost" onClick={() => dialogRef.current?.close()} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={publish} disabled={pending || issues.length > 0}>
              {pending ? "Publishing…" : "Confirm and publish"}
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
