import { AlertTriangle, BarChart3, BookOpenCheck, Users } from "lucide-react";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export type StudentProgressRow = {
  student_id: string;
  student_name: string;
  course_title: string;
  assessment_count: number | string;
  submitted_count: number | string;
  graded_count: number | string;
  pending_count: number | string;
  average_score: number | string | null;
};

export type QuestionAnalysisRow = {
  assessment_id: string;
  assessment_title: string;
  question_id: string;
  question_position: number;
  question_type: string;
  question_excerpt: string;
  max_marks: number | string;
  answer_count: number | string;
  pending_count: number | string;
  graded_count: number | string;
  average_awarded: number | string | null;
};

type AdvancedAssessmentAnalyticsProps = {
  studentRows: StudentProgressRow[];
  questionRows: QuestionAnalysisRow[];
  studentError: boolean;
  questionError: boolean;
};

const numeric = (value: number | string | null | undefined) => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const numberLabel = (value: number | string | null | undefined) => numeric(value).toLocaleString("en-IN");
const marksLabel = (value: number | string | null | undefined) => value == null ? "—" : numeric(value).toFixed(2);

export function AdvancedAssessmentAnalytics({
  studentRows,
  questionRows,
  studentError,
  questionError,
}: AdvancedAssessmentAnalyticsProps) {
  const questionsWithResponses = questionRows
    .filter((row) => numeric(row.answer_count) > 0)
    .sort((a, b) => {
      const aAverage = a.average_awarded == null || numeric(a.max_marks) <= 0
        ? Number.POSITIVE_INFINITY
        : numeric(a.average_awarded) / numeric(a.max_marks);
      const bAverage = b.average_awarded == null || numeric(b.max_marks) <= 0
        ? Number.POSITIVE_INFINITY
        : numeric(b.average_awarded) / numeric(b.max_marks);
      return aAverage - bAverage || a.assessment_title.localeCompare(b.assessment_title) || a.question_position - b.question_position;
    });

  return (
    <div className="mt-10 space-y-8">
      <section aria-labelledby="student-progress-heading" className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <Users className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="student-progress-heading" className="text-xl font-bold text-forest-950">Student progress</h2>
            <p className="mt-1 text-sm text-forest-600">Submission, grading and average-score summaries for learners enrolled in your courses.</p>
          </div>
        </div>

        {studentError ? (
          <AdvancedAnalyticsUnavailable functionName="get_teacher_student_progress" />
        ) : studentRows.length === 0 ? (
          <EmptyState icon={Users} title="No student progress yet" description="Progress summaries will appear when students are enrolled in your courses." />
        ) : (
          <Card>
            <div className="overflow-x-auto rounded-card">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead className="bg-sage-50 text-xs uppercase tracking-wide text-forest-600">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Student / course</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Published assessments</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Submitted</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Graded</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Pending</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Average marks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sage-100">
                  {studentRows.map((row) => (
                    <tr key={`${row.student_id}:${row.course_title}`} className="align-top hover:bg-sage-50/50">
                      <td className="px-4 py-3">
                        <p className="font-semibold text-forest-950">{row.student_name || "Student"}</p>
                        <p className="mt-0.5 text-xs text-forest-500">{row.course_title}</p>
                      </td>
                      <NumericCell value={numberLabel(row.assessment_count)} />
                      <NumericCell value={numberLabel(row.submitted_count)} />
                      <NumericCell value={numberLabel(row.graded_count)} />
                      <NumericCell value={numberLabel(row.pending_count)} />
                      <NumericCell value={marksLabel(row.average_score)} />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="border-t border-sage-100 px-4 py-3 text-xs text-forest-500">Average marks include fully graded attempts only. Submitted counts are attempts, so they may exceed the number of published assessments when repeat attempts are allowed.</p>
          </Card>
        )}
      </section>

      <section aria-labelledby="question-analysis-heading" className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <BookOpenCheck className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="question-analysis-heading" className="text-xl font-bold text-forest-950">Question-wise analysis</h2>
            <p className="mt-1 text-sm text-forest-600">Compare marked responses by question. Lower average percentage can indicate a question that needs a closer look.</p>
          </div>
        </div>

        {questionError ? (
          <AdvancedAnalyticsUnavailable functionName="get_teacher_question_analysis" />
        ) : questionsWithResponses.length === 0 ? (
          <EmptyState icon={BarChart3} title="No question analysis yet" description="Question statistics will appear after students submit assessments and responses have been scored." />
        ) : (
          <Card>
            <div className="overflow-x-auto rounded-card">
              <table className="w-full min-w-[900px] border-collapse text-left text-sm">
                <thead className="bg-sage-50 text-xs uppercase tracking-wide text-forest-600">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Assessment / question</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Type</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Responses</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Pending</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Graded</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Average marks</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Average awarded</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sage-100">
                  {questionsWithResponses.map((row) => {
                    const maxMarks = numeric(row.max_marks);
                    const average = row.average_awarded == null ? null : numeric(row.average_awarded);
                    const percentage = average == null || maxMarks <= 0 ? null : Math.max(0, Math.min(100, (average / maxMarks) * 100));
                    return (
                      <tr key={row.question_id} className="align-top hover:bg-sage-50/50">
                        <td className="max-w-lg px-4 py-3">
                          <p className="font-semibold text-forest-950">{row.assessment_title}</p>
                          <p className="mt-1 text-xs text-forest-500">Question {row.question_position + 1}: {row.question_excerpt}</p>
                        </td>
                        <td className="px-4 py-3 text-forest-700">{row.question_type.replaceAll("_", " ")}</td>
                        <NumericCell value={numberLabel(row.answer_count)} />
                        <NumericCell value={numberLabel(row.pending_count)} />
                        <NumericCell value={numberLabel(row.graded_count)} />
                        <NumericCell value={`${marksLabel(row.average_awarded)} / ${marksLabel(row.max_marks)}`} />
                        <td className="min-w-40 px-4 py-3">
                          {percentage == null ? (
                            <span className="text-forest-500">Awaiting marks</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <div className="h-2 w-20 overflow-hidden rounded-full bg-sage-100" role="progressbar" aria-label={`Average awarded for question ${row.question_position + 1}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(percentage)}>
                                <div className="h-full rounded-full bg-brand-600" style={{ width: `${percentage}%` }} />
                              </div>
                              <span className="tabular-nums text-forest-800">{percentage.toFixed(0)}%</span>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="border-t border-sage-100 px-4 py-3 text-xs text-forest-500">Questions are ordered from lower to higher average awarded percentage. Only responses with score records are counted; averages use awarded marks and exclude unanswered pending marks.</p>
          </Card>
        )}
      </section>
    </div>
  );
}

function NumericCell({ value }: { value: string }) {
  return <td className="px-4 py-3 text-right tabular-nums text-forest-800">{value}</td>;
}

function AdvancedAnalyticsUnavailable({ functionName }: { functionName: string }) {
  return (
    <Card>
      <CardBody>
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
          <div>
            <h3 className="font-semibold text-forest-950">Advanced analytics are not available</h3>
            <p className="mt-1 text-sm text-forest-600">The database function <code>{functionName}</code> could not be called. Check that migration <code>20261101000001_phase2_advanced_analytics.sql</code> has been applied in Supabase and that the signed-in account has teacher access. Basic assessment summaries remain available independently.</p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
