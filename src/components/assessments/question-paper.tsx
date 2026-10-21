"use client";

import Link from "next/link";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Cloud, CloudOff, LoaderCircle, RefreshCw, Clock3, ChevronLeft, ChevronRight } from "lucide-react";
import { AnswerAutosaver, bindOnlineEvents, type AutosaveSnapshot } from "@/lib/assessments/autosave";
import { getAttemptAnswersAction, saveAnswerAction } from "@/lib/assessments/answer-actions";
import { submitAttemptAction } from "@/lib/assessments/attempt-actions";
import { Card, CardBody } from "@/components/ui/card";
import { answerInstruction, marksLabel, optionLabel } from "@/lib/assessments/paper-view";
import type { StudentQuestion } from "@/lib/assessments/paper";
import type { AnswerPayload } from "@/lib/assessments/answers";

/**
 * Phase E3: restores the server-confirmed answer snapshot and connects every input to the existing
 * revision-aware autosave engine. The browser never talks directly to Supabase; server actions and
 * database functions remain the authorization boundary.
 */
export function QuestionPaper({ questions, attemptId, secondsRemaining }: { questions: StudentQuestion[]; attemptId: string; secondsRemaining: number | null }) {
  const questionRefs = useRef<Array<HTMLLIElement | null>>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [showReview, setShowReview] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(secondsRemaining === null ? null : Math.max(0, secondsRemaining));
  const saverRef = useRef<AnswerAutosaver | null>(null);
  const [snapshot, setSnapshot] = useState<AutosaveSnapshot>({ closed: false, closedReason: null, unsaved: 0, questions: {} });
  const [ready, setReady] = useState(false);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<"submitted" | "expired" | null>(null);

  useEffect(() => {
    if (secondsRemaining === null) return;
    setSecondsLeft(Math.max(0, secondsRemaining));
    const timer = window.setInterval(() => {
      setSecondsLeft((current) => current === null ? null : Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [secondsRemaining]);

  useEffect(() => {
    let active = true;
    const saver = new AnswerAutosaver({
      save: async (req) => {
        const result = await saveAnswerAction({ attemptId, questionId: req.questionId, answer: req.answer, revision: req.revision });
        return result.ok
          ? { ok: true as const, saved: result.saved }
          : { ok: false as const, kind: result.kind, error: result.error };
      },
    });
    saverRef.current = saver;
    const unsubscribe = saver.subscribe(() => {
      if (active) setSnapshot(saver.snapshot());
    });
    const unbindOnline = bindOnlineEvents(saver, window);

    void (async () => {
      try {
        const result = await getAttemptAnswersAction({ attemptId });
        if (!active) return;
        if (!result.ok) {
          setRestoreError(result.error);
          return;
        }
        if (result.snapshot.attemptId !== attemptId) {
          setRestoreError("We could not verify the saved answers. Please reload the assessment.");
          return;
        }
        saver.hydrate(result.snapshot.answers);
        setSnapshot(saver.snapshot());
        setReady(true);
      } catch {
        if (active) setRestoreError("We could not load your saved answers. Please try again.");
      }
    })();

    return () => {
      active = false;
      unsubscribe();
      unbindOnline();
      saver.dispose();
      if (saverRef.current === saver) saverRef.current = null;
    };
  }, [attemptId]);

  useEffect(() => {
    if (showReview) return;
    const target = questionRefs.current[currentQuestion];
    if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [currentQuestion, showReview]);

  function setAnswer(questionId: string, answer: AnswerPayload | null, immediate = false) {
    saverRef.current?.setAnswer(questionId, answer, { immediate });
  }

  function retrySaving() {
    saverRef.current?.retryNow();
  }

  async function confirmAndSubmit() {
    if (submitting || finalStatus) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Never submit while a typed answer is still waiting in the autosave queue.
      const flushed = await saverRef.current?.flush();
      if (!flushed || !flushed.ok || flushed.closed) {
        setSubmitError("Some answers are not confirmed as saved. Retry saving and wait for ‘All answers saved’ before submitting.");
        return;
      }

      // The database checks ownership and the official deadline and makes submission idempotent.
      const result = await submitAttemptAction({ attemptId });
      if (!result.ok) {
        setSubmitError(result.error);
        return;
      }
      if (result.attempt.status === "submitted") {
        saverRef.current?.dispose();
        setFinalStatus("submitted");
        setConfirmSubmit(false);
        return;
      }
      if (result.attempt.status === "expired") {
        saverRef.current?.dispose();
        setFinalStatus("expired");
        setConfirmSubmit(false);
        return;
      }
      setSubmitError("The server has not confirmed submission yet. Please check your connection and try again.");
    } catch {
      setSubmitError("We could not confirm submission. Check your connection, then retry. Do not assume the assessment was submitted.");
    } finally {
      setSubmitting(false);
    }
  }

  const statuses = Object.values(snapshot.questions);
  const answeredCount = questions.filter((q) => {
    const answer = snapshot.questions[q.id]?.answer ?? null;
    if (answer === null) return false;
    return "text" in answer ? answer.text.trim().length > 0 : "optionIds" in answer ? answer.optionIds.length > 0 : true;
  }).length;
  const timeExpired = secondsLeft !== null && secondsLeft <= 0;
  const formatTime = (total: number) => `${Math.floor(total / 3600).toString().padStart(2, "0")}:${Math.floor((total % 3600) / 60).toString().padStart(2, "0")}:${(total % 60).toString().padStart(2, "0")}`;
  function goToQuestion(index: number) {
    const bounded = Math.max(0, Math.min(questions.length - 1, index));
    setCurrentQuestion(bounded);
    questionRefs.current[bounded]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const savingCount = statuses.filter((s) => s.state === "saving" || s.state === "pending" || s.state === "retrying").length;
  const failedCount = statuses.filter((s) => s.state === "failed").length;
  const rejectedCount = statuses.filter((s) => s.state === "rejected").length;

  function statusLabel() {
    if (!ready) return "Loading saved answers…";
    if (snapshot.closed) return snapshot.closedReason ?? "This attempt is no longer accepting answers.";
    if (failedCount) return `${failedCount} answer${failedCount === 1 ? " needs" : "s need"} retrying`;
    if (rejectedCount) return `${rejectedCount} answer${rejectedCount === 1 ? " was" : "s were"} rejected. Please edit ${rejectedCount === 1 ? "it" : "them"}.`;
    if (snapshot.unsaved > 0 || savingCount > 0) return "Saving your answers…";
    return "All answers saved";
  }

  if (finalStatus === "submitted") {
    return (
      <section aria-labelledby="submission-complete" className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5 sm:p-6">
        <div className="flex items-center gap-3"><CheckCircle2 className="h-7 w-7 text-emerald-700" aria-hidden /><h3 id="submission-complete" className="text-xl font-extrabold text-emerald-950">Assessment submitted</h3></div>
        <p className="text-sm text-emerald-950">The server confirmed that your assessment has been submitted. You can safely leave this page.</p>
        <Link href="/dashboard/student/results" className="inline-flex items-center rounded-xl bg-emerald-800 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-900">View my results</Link>
      </section>
    );
  }

  if (finalStatus === "expired") {
    return (
      <section aria-labelledby="submission-expired" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-5 sm:p-6">
        <div className="flex items-center gap-3"><AlertCircle className="h-7 w-7 text-amber-800" aria-hidden /><h3 id="submission-expired" className="text-xl font-extrabold text-amber-950">Assessment time expired</h3></div>
        <p className="text-sm text-amber-950">The server reports that this attempt expired before submission could be completed. Your saved answers remain governed by the assessment system.</p>
      </section>
    );
  }

  return (
    <>
      <div role="status" aria-live="polite" className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${!ready || snapshot.closed || snapshot.unsaved > 0 || failedCount || rejectedCount ? "border-amber-300 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-950"}`}>
        <span className="flex items-center gap-2">
          {!ready ? <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden /> : failedCount || rejectedCount || snapshot.closed ? <AlertCircle className="h-4 w-4" aria-hidden /> : snapshot.unsaved > 0 || savingCount > 0 ? <Cloud className="h-4 w-4" aria-hidden /> : <CheckCircle2 className="h-4 w-4" aria-hidden />}
          {statusLabel()}
        </span>
        {failedCount > 0 && <button type="button" onClick={retrySaving} className="inline-flex items-center gap-1 font-semibold underline"><RefreshCw className="h-3.5 w-3.5" aria-hidden /> Retry saving</button>}
      </div>
      {restoreError && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900"><CloudOff className="mr-2 inline h-4 w-4" aria-hidden />{restoreError} Refresh the page to try again.</div>}
      <div className="grid gap-3 rounded-xl border border-sage-200 bg-white p-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="text-sm font-semibold">Progress: {answeredCount} of {questions.length} answered</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-sage-100" role="progressbar" aria-label="Questions answered" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answeredCount}>
            <div className="h-full rounded-full bg-emerald-600 transition-all" style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }} />
          </div>
        </div>
        {secondsLeft !== null && <div role="timer" aria-live="off" className={`flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-lg font-bold ${secondsLeft <= 60 ? "bg-red-100 text-red-800" : "bg-sage-50 text-forest-800"}`}><Clock3 className="h-5 w-5" aria-hidden />{formatTime(secondsLeft)}</div>}
      </div>
      {timeExpired && <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">Your countdown has reached zero. The server controls the official deadline, so your attempt may no longer accept answers. Please do not refresh until the status above confirms saved answers.</div>}
      {showReview ? (
        <section aria-labelledby="review-heading" className="space-y-4 rounded-xl border border-sage-200 bg-white p-4 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 id="review-heading" className="text-xl font-extrabold">Review your answers</h3>
              <p className="mt-1 text-sm text-forest-600">Check each question before you finish. You can return to any question and change your answer.</p>
            </div>
            <div className="rounded-lg bg-sage-50 px-3 py-2 text-sm font-semibold">{answeredCount} of {questions.length} answered</div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3" aria-label="Answer summary">
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3"><p className="text-xs font-semibold text-emerald-900">Answered</p><p className="text-2xl font-extrabold text-emerald-900">{answeredCount}</p></div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs font-semibold text-amber-900">Unanswered</p><p className="text-2xl font-extrabold text-amber-900">{questions.length - answeredCount}</p></div>
            <div className="rounded-lg border border-sage-200 bg-sage-50 p-3"><p className="text-xs font-semibold text-forest-800">Total questions</p><p className="text-2xl font-extrabold text-forest-900">{questions.length}</p></div>
          </div>
          {(snapshot.unsaved > 0 || savingCount > 0 || failedCount > 0 || rejectedCount > 0) && (
            <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
              Some answers may not be saved yet. Wait for “All answers saved” before finishing the assessment.
            </div>
          )}
          <ol className="divide-y divide-sage-200 rounded-lg border border-sage-200" aria-label="Answer review list">
            {questions.map((q, i) => {
              const answer = snapshot.questions[q.id]?.answer ?? null;
              const answered = answer !== null && ("text" in answer ? answer.text.trim().length > 0 : "optionIds" in answer ? answer.optionIds.length > 0 : true);
              return (
                <li key={q.id} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-forest-500">Question {i + 1}</p>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-sm font-medium text-forest-900">{q.text}</p>
                    <p className={`mt-1 text-xs font-semibold ${answered ? "text-emerald-800" : "text-amber-800"}`}>{answered ? "Answered" : "Not answered"}</p>
                  </div>
                  <button type="button" onClick={() => { setCurrentQuestion(i); setShowReview(false); }} className="shrink-0 rounded-lg border border-sage-300 px-3 py-2 text-sm font-semibold hover:bg-sage-50 focus:outline-none focus:ring-2 focus:ring-brand-500">{answered ? "Review answer" : "Answer question"}</button>
                </li>
              );
            })}
          </ol>
          {submitError && <div role="alert" className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-950">{submitError}</div>}
          {confirmSubmit ? (
            <div role="dialog" aria-modal="true" aria-labelledby="confirm-submit-heading" className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <h4 id="confirm-submit-heading" className="font-extrabold text-amber-950">Submit this assessment?</h4>
              <p className="text-sm text-amber-950">You have answered {answeredCount} of {questions.length} questions. Submission is final; you will not be able to change your answers afterwards.</p>
              <p className="text-sm text-amber-950">We will first make sure every pending answer has been saved. The server will then verify your attempt and deadline.</p>
              <div className="flex flex-wrap justify-end gap-3">
                <button type="button" disabled={submitting} onClick={() => setConfirmSubmit(false)} className="rounded-lg border border-amber-400 px-4 py-2 text-sm font-semibold disabled:opacity-50">Go back</button>
                <button type="button" disabled={submitting || !ready || Boolean(restoreError) || snapshot.closed || timeExpired} onClick={confirmAndSubmit} className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50">{submitting ? "Saving and submitting…" : "Confirm final submission"}</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-3">
              <button type="button" onClick={() => { setShowReview(false); goToQuestion(0); }} className="rounded-lg border border-sage-300 px-4 py-2 text-sm font-semibold hover:bg-sage-50">Back to questions</button>
              <button type="button" disabled={!ready || Boolean(restoreError) || snapshot.closed || timeExpired || submitting} onClick={() => { setSubmitError(null); setConfirmSubmit(true); }} className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-bold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50">Submit assessment</button>
            </div>
          )}
        </section>
      ) : (
      <>
      <nav aria-label="Question navigation" className="rounded-xl border border-sage-200 bg-white p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold">Questions</p><p className="text-xs text-forest-600">Answered {answeredCount}/{questions.length}</p></div>
        <div className="flex flex-wrap gap-2">
          {questions.map((q, i) => {
            const answer = snapshot.questions[q.id]?.answer ?? null;
            const answered = answer !== null && ("text" in answer ? answer.text.trim().length > 0 : "optionIds" in answer ? answer.optionIds.length > 0 : true);
            return <button key={q.id} type="button" onClick={() => goToQuestion(i)} aria-current={currentQuestion === i ? "step" : undefined} aria-label={`Question ${i + 1}${answered ? ", answered" : ", unanswered"}`} className={`h-10 min-w-10 rounded-lg border px-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-brand-500 ${currentQuestion === i ? "border-brand-700 bg-brand-700 text-white" : answered ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-sage-300 bg-white text-forest-800"}`}>{i + 1}</button>;
          })}
        </div>
        <div className="mt-4 flex items-center justify-between gap-3">
          <button type="button" disabled={currentQuestion <= 0} onClick={() => goToQuestion(currentQuestion - 1)} className="inline-flex items-center gap-1 rounded-lg border border-sage-300 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft className="h-4 w-4" aria-hidden />Previous</button>
          <span className="text-xs text-forest-600">Question {questions.length ? currentQuestion + 1 : 0} of {questions.length}</span>
          <button type="button" disabled={currentQuestion >= questions.length - 1} onClick={() => goToQuestion(currentQuestion + 1)} className="inline-flex items-center gap-1 rounded-lg border border-sage-300 px-3 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40">Next<ChevronRight className="h-4 w-4" aria-hidden /></button>
        </div>
      </nav>
      <p className="text-xs text-forest-600">Answers are saved automatically. Keep this page open until the status says “All answers saved”. If your connection drops, saving will retry when you are online.</p>
      <fieldset disabled={!ready || Boolean(restoreError) || snapshot.closed || timeExpired} className="min-w-0 space-y-4 disabled:opacity-70">
      <ol className="space-y-4" aria-label="Questions">
        {questions.map((q, i) => {
          const answer = snapshot.questions[q.id]?.answer ?? null;
          return (
            <li key={q.id} ref={(node) => { questionRefs.current[i] = node; }} className="scroll-mt-6">
              <Card>
                <CardBody className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <p id={`question-${q.id}`} className="whitespace-pre-line font-medium">
                      <span className="mr-2 text-forest-500">{i + 1}.</span>
                      {q.text}
                    </p>
                    <span className="shrink-0 text-xs font-semibold text-forest-600">{marksLabel(q.marks)}</span>
                  </div>

                  {q.imageUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={q.imageUrl} alt="Picture for this question" referrerPolicy="no-referrer" loading="lazy" className="max-h-72 max-w-full rounded-xl border border-sage-200 object-contain" />
                  )}

                  <p className="text-xs text-forest-600">{answerInstruction(q)}</p>

                  {q.type === "single_choice" && (
                    <fieldset className="space-y-2" aria-labelledby={`question-${q.id}`}>
                      <legend className="sr-only">Choose one answer</legend>
                      {q.options.map((o, j) => (
                        <label key={o.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-sage-200 px-3 py-3 text-sm transition hover:bg-sage-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                          <input type="radio" name={`answer-${q.id}`} value={o.id} checked={answer !== null && "optionId" in answer && answer.optionId === o.id} onChange={() => setAnswer(q.id, { optionId: o.id }, true)} className="mt-1 accent-emerald-700" />
                          <span className="font-semibold text-forest-500">{optionLabel(j)}.</span>
                          <span className="whitespace-pre-line">{o.text}</span>
                        </label>
                      ))}
                      <button type="button" className="text-xs font-medium text-forest-600 underline" onClick={() => setAnswer(q.id, null)}>Clear answer</button>
                    </fieldset>
                  )}

                  {q.type === "multiple_select" && (
                    <fieldset className="space-y-2" aria-labelledby={`question-${q.id}`}>
                      <legend className="sr-only">Choose all answers that apply</legend>
                      {q.options.map((o, j) => {
                        const selected = answer !== null && "optionIds" in answer && answer.optionIds.includes(o.id);
                        return (
                          <label key={o.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-sage-200 px-3 py-3 text-sm transition hover:bg-sage-50 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                            <input type="checkbox" checked={selected} onChange={(event) => {
                              const current = answer !== null && "optionIds" in answer ? answer.optionIds : [];
                              const next = event.target.checked ? [...current, o.id] : current.filter((id) => id !== o.id);
                              setAnswer(q.id, next.length ? { optionIds: next } : null, true);
                            }} className="mt-1 accent-emerald-700" />
                            <span className="font-semibold text-forest-500">{optionLabel(j)}.</span>
                            <span className="whitespace-pre-line">{o.text}</span>
                          </label>
                        );
                      })}
                      <button type="button" className="text-xs font-medium text-forest-600 underline" onClick={() => setAnswer(q.id, null)}>Clear answer</button>
                    </fieldset>
                  )}

                  {q.type === "true_false" && (
                    <fieldset className="flex flex-wrap gap-3" aria-labelledby={`question-${q.id}`}>
                      <legend className="sr-only">Choose true or false</legend>
                      {[{ label: "True", value: true }, { label: "False", value: false }].map((choice) => (
                        <label key={choice.label} className="flex min-w-28 cursor-pointer items-center gap-2 rounded-xl border border-sage-200 px-4 py-3 text-sm has-[:checked]:border-brand-500 has-[:checked]:bg-brand-50">
                          <input type="radio" name={`answer-${q.id}`} checked={answer !== null && "value" in answer && answer.value === choice.value} onChange={() => setAnswer(q.id, { value: choice.value }, true)} className="accent-emerald-700" />
                          {choice.label}
                        </label>
                      ))}
                      <button type="button" className="text-xs font-medium text-forest-600 underline" onClick={() => setAnswer(q.id, null)}>Clear answer</button>
                    </fieldset>
                  )}

                  {q.type === "short_answer" && (
                    <div className="space-y-2">
                      <label htmlFor={`answer-${q.id}`} className="text-sm font-semibold">Your answer</label>
                      <input id={`answer-${q.id}`} type="text" maxLength={500} value={answer !== null && "text" in answer ? answer.text : ""} onChange={(event) => setAnswer(q.id, event.target.value ? { text: event.target.value } : null)} placeholder="Type your answer here" className="w-full rounded-xl border border-sage-300 bg-white px-3 py-3 text-sm text-forest-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200" />
                      <p className="text-right text-xs text-forest-500">{answer !== null && "text" in answer ? answer.text.length : 0}/500</p>
                    </div>
                  )}

                  {q.type === "descriptive" && (
                    <div className="space-y-2">
                      <label htmlFor={`answer-${q.id}`} className="text-sm font-semibold">Your answer</label>
                      <textarea id={`answer-${q.id}`} rows={5} maxLength={10000} value={answer !== null && "text" in answer ? answer.text : ""} onChange={(event) => setAnswer(q.id, event.target.value ? { text: event.target.value } : null)} placeholder="Write your answer in detail" className="w-full resize-y rounded-xl border border-sage-300 bg-white px-3 py-3 text-sm text-forest-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200" />
                      <p className="text-right text-xs text-forest-500">{answer !== null && "text" in answer ? answer.text.length : 0}/10,000</p>
                    </div>
                  )}
                </CardBody>
              </Card>
            </li>
          );
        })}
      </ol>
      </fieldset>
      <div className="flex flex-wrap justify-end gap-3">
        <button type="button" disabled={!ready || Boolean(restoreError)} onClick={() => setShowReview(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-800 disabled:cursor-not-allowed disabled:opacity-50">Review answers</button>
      </div>
      </>
      )}
    </>
  );
}
