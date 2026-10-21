import { ClipboardList, Info } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getAttemptPaperAction, getOpenAttemptAction } from "@/lib/assessments/attempt-actions";
import { loadPaperView, marksLabel } from "@/lib/assessments/paper-view";
import { QuestionPaper } from "./question-paper";
import { RetryButton } from "./retry-button";

/** Loading state. Used as the Suspense fallback while the server fetches the paper. */
export function PaperSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading your questions" className="mt-8 space-y-4">
      <Skeleton className="h-6 w-48" />
      {[0, 1, 2].map((i) => (
        <Card key={i}>
          <CardBody className="space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardBody>
        </Card>
      ))}
    </section>
  );
}

/**
 * Async SERVER component. The questions are requested only here, and only after the server has confirmed the
 * student's open attempt (see loadPaperView). Nothing is fetched or stored in the browser.
 */
export async function AttemptPaperSection({ assessmentId }: { assessmentId: string }) {
  const view = await loadPaperView(
    { getOpenAttempt: getOpenAttemptAction, getPaper: getAttemptPaperAction },
    assessmentId,
  );

  if (view.kind === "none") return null;

  if (view.kind === "error") {
    return (
      <section className="mt-8" aria-label="Your questions">
        <Alert tone="error">
          <p>{view.message}</p>
          <div className="mt-3">
            <RetryButton />
          </div>
        </Alert>
      </section>
    );
  }

  if (view.kind === "empty") {
    return (
      <section className="mt-8" aria-label="Your questions">
        <EmptyState
          icon={ClipboardList}
          title="No questions to show"
          description="This assessment does not have any questions yet. Please check back later or ask your teacher."
        />
      </section>
    );
  }

  const { paper } = view;
  return (
    <section className="mt-8 space-y-4" aria-labelledby="paper-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="paper-h" className="text-xl font-extrabold">
          Your questions
        </h2>
        <p className="text-sm text-forest-600">
          {paper.questions.length} {paper.questions.length === 1 ? "question" : "questions"} · {marksLabel(paper.assessment.totalMarks)}
        </p>
      </div>
      <p className="flex items-start gap-2 text-xs text-forest-600">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        Your answers save automatically. The countdown and question navigation are available below. Review and submission controls are added in later phases.
      </p>
      <QuestionPaper questions={paper.questions} attemptId={paper.attempt.attemptId} secondsRemaining={paper.attempt.secondsRemaining} />
    </section>
  );
}
