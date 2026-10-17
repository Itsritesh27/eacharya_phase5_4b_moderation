import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ListTree } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { EnrollButton } from "@/components/learning/enroll-button";
import { ProgressBar } from "@/components/learning/progress-bar";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getViewer } from "@/lib/auth/session";
import { getPublishedCourseBySlug } from "@/lib/data/curriculum";
import { getCompletedLessonIds, getEnrolledCourseIds } from "@/lib/data/learning";
import { computeCourseProgress } from "@/lib/learning/progress";

type Params = Promise<{ slug: string }>;

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const detail = await getPublishedCourseBySlug(slug);
  return { title: detail?.course.title ?? "Course" };
}

export default async function CourseDetailPage({ params }: { params: Params }) {
  const { slug } = await params;
  const detail = await getPublishedCourseBySlug(slug);
  if (!detail) notFound();

  const { course, units } = detail;
  const viewer = await getViewer();
  const isStudent = viewer?.role === "student";

  const [enrolledIds, completed] = viewer
    ? await Promise.all([getEnrolledCourseIds(viewer.userId), getCompletedLessonIds(viewer.userId)])
    : [new Set<string>(), new Set<string>()];
  const enrolled = enrolledIds.has(course.id);

  const lessonIds = units.flatMap((u) => u.lessons.map((l) => l.id));
  const progress = computeCourseProgress(lessonIds, completed);

  return (
    <PageShell>
      <div className="container-page py-12">
        <Link
          href="/courses"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All courses
        </Link>

        <header className="mt-4 rounded-card bg-gradient-to-br from-brand-800 to-forest-900 p-6 text-white sm:p-10">
          <p className="text-sm font-semibold text-brand-200">
            {course.class?.name} · {course.subject?.name ?? "Geography"}
          </p>
          <h1 className="mt-2 text-3xl font-extrabold text-white sm:text-4xl">{course.title}</h1>
          <p className="mt-3 max-w-2xl text-brand-100">{course.description}</p>
          <p className="mt-3 text-sm text-brand-200">
            {units.length} unit{units.length === 1 ? "" : "s"} · {lessonIds.length} lesson{lessonIds.length === 1 ? "" : "s"}
          </p>

          <div className="mt-6">
            {!viewer ? (
              <ButtonLink
                href={`/sign-in?next=${encodeURIComponent(`/courses/${course.slug}`)}`}
                variant="secondary"
              >
                Sign in to enrol
              </ButtonLink>
            ) : enrolled ? (
              <div className="max-w-sm rounded-xl bg-white/10 p-3 text-white [&_*]:!text-white">
                <ProgressBar progress={progress} />
              </div>
            ) : isStudent ? (
              <EnrollButton courseId={course.id} />
            ) : (
              <p className="text-sm text-brand-200">Enrolment is for student accounts.</p>
            )}
          </div>
        </header>

        <section aria-labelledby="curriculum-heading" className="mt-10">
          <h2 id="curriculum-heading" className="text-xl font-bold">
            Curriculum
          </h2>

          {units.length === 0 ? (
            <div className="mt-4">
              <EmptyState
                icon={ListTree}
                title="No units yet"
                description="This course does not have any units published yet."
              />
            </div>
          ) : (
            <ol className="mt-4 space-y-4">
              {units.map((unit, i) => (
                <li key={unit.id} className="rounded-card border border-sage-200 bg-white p-5 shadow-card">
                  <h3 className="font-bold">
                    Unit {i + 1}: {unit.title}
                  </h3>
                  {unit.description && <p className="mt-1 text-sm text-forest-600">{unit.description}</p>}
                  {unit.lessons.length > 0 ? (
                    <ul className="mt-3 space-y-1.5 border-t border-sage-100 pt-3">
                      {unit.lessons.map((l) => (
                        <li key={l.id} className="text-sm text-forest-800">
                          {enrolled ? (
                            <Link href={`/tutorials/${l.id}`} className="hover:text-brand-700 hover:underline">
                              {completed.has(l.id) ? "✓ " : ""}
                              {l.title}
                            </Link>
                          ) : (
                            l.title
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 border-t border-sage-100 pt-3 text-sm text-forest-500">
                      No lessons published yet.
                    </p>
                  )}
                </li>
              ))}
            </ol>
          )}
          {!enrolled && lessonIds.length > 0 && (
            <p className="mt-6 text-sm text-forest-600">Enrol to open lessons and track your progress.</p>
          )}
        </section>
      </div>
    </PageShell>
  );
}
