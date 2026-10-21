import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ListTree } from "lucide-react";
import { ChapterAccordion, type Chapter } from "@/components/courses/chapter-accordion";
import { LandscapeArt, type LandscapeVariant } from "@/components/landing/landscape-art";
import { RESOURCE_TYPE_INFO } from "@/components/resources/resource-icon";
import { createClient } from "@/lib/supabase/server";
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

const VARIANT: Record<number, LandscapeVariant> = { 9: "hills", 10: "farmland", 11: "peaks", 12: "city" };

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

  // Resources attached to this course's chapters (RLS: signed-in users see published ones).
  let resourceRows: { id: string; title: string; resource_type: keyof typeof RESOURCE_TYPE_INFO; unit_id: string | null }[] = [];
  if (viewer) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("resources")
      .select("id, title, resource_type, unit_id")
      .eq("course_id", course.id)
      .eq("is_published", true)
      .order("title");
    resourceRows = (data ?? []) as typeof resourceRows;
  }
  const chapters: Chapter[] = units.map((u) => ({
    id: u.id,
    title: u.title,
    description: u.description ?? "",
    lessons: u.lessons.map((l) => ({ id: l.id, title: l.title, done: completed.has(l.id) })),
    resources: resourceRows
      .filter((r) => r.unit_id === u.id)
      .map((r) => ({ id: r.id, title: r.title, typeLabel: RESOURCE_TYPE_INFO[r.resource_type]?.label ?? "Resource" })),
  }));
  const nextLessonId = lessonIds.find((id) => !completed.has(id)) ?? lessonIds[0] ?? null;

  return (
    <PageShell>
      <div className="container-page py-10">
        <Link
          href="/courses"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          All courses
        </Link>

        <header className="mt-4 overflow-hidden rounded-card border border-sage-200 bg-white shadow-card">
          <div className="grid gap-0 md:grid-cols-[260px_1fr_280px]">
            <div className="hidden md:block">
              <LandscapeArt variant={VARIANT[course.class?.grade ?? 9] ?? "hills"} />
            </div>
            <div className="p-5 sm:p-6">
              <div className="flex flex-wrap gap-2">
                <span className="rounded-pill bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">{course.class?.name}</span>
                <span className="rounded-pill bg-sage-100 px-2.5 py-0.5 text-xs font-medium text-forest-700">{course.subject?.name ?? "Geography"}</span>
              </div>
              <h1 className="mt-2 text-2xl font-extrabold sm:text-3xl">{course.title}</h1>
              <p className="mt-2 text-sm text-forest-600">{course.description}</p>
              <p className="mt-3 text-xs text-forest-500">
                {units.length} chapter{units.length === 1 ? "" : "s"} · {lessonIds.length} video lesson{lessonIds.length === 1 ? "" : "s"}
              </p>
            </div>
            <div className="flex flex-col justify-center gap-3 border-t border-sage-100 bg-sage-50/60 p-5 md:border-l md:border-t-0">
              {!viewer ? (
                <ButtonLink href={`/sign-in?next=${encodeURIComponent(`/courses/${course.slug}`)}`}>Sign in to enrol</ButtonLink>
              ) : enrolled ? (
                <>
                  <ProgressBar progress={progress} label="Course progress" />
                  {nextLessonId && (
                    <ButtonLink href={`/tutorials/${nextLessonId}`}>{progress.completed > 0 ? "Continue learning" : "Start learning"}</ButtonLink>
                  )}
                </>
              ) : isStudent ? (
                <EnrollButton courseId={course.id} />
              ) : (
                <p className="text-sm text-forest-600">Enrolment is for student accounts.</p>
              )}
            </div>
          </div>
        </header>

        <section aria-labelledby="curriculum-heading" className="mt-8">
          <h2 id="curriculum-heading" className="mb-3 text-xl font-bold">Syllabus</h2>

          {units.length === 0 ? (
            <EmptyState icon={ListTree} title="No chapters yet" description="This course does not have any chapters published yet." />
          ) : (
            <ChapterAccordion chapters={chapters} canOpenLessons={enrolled} canOpenResources={Boolean(viewer)} />
          )}
          {!enrolled && lessonIds.length > 0 && (
            <p className="mt-6 text-sm text-forest-600">Enrol to open lessons and track your progress.</p>
          )}
        </section>
      </div>
    </PageShell>
  );
}
