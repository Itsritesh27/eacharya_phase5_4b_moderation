import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText, Lock, VideoOff, TriangleAlert } from "lucide-react";
import { z } from "zod";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { BookmarkButton } from "@/components/learning/bookmark-button";
import { CompleteButton } from "@/components/learning/complete-button";
import { EnrollButton } from "@/components/learning/enroll-button";
import { LessonOutline } from "@/components/learning/lesson-outline";
import { LessonTabs } from "@/components/learning/lesson-tabs";
import { NotesEditor } from "@/components/learning/notes-editor";
import { ProgressBar } from "@/components/learning/progress-bar";
import { VideoPlayer } from "@/components/learning/video-player";
import { RESOURCE_TYPE_INFO, ResourceIcon } from "@/components/resources/resource-icon";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/auth/session";
import { getLessonPageData } from "@/lib/data/learning";
import { computeCourseProgress } from "@/lib/learning/progress";
import { resolveLessonVideo } from "@/lib/learning/video";

export const metadata: Metadata = { title: "Lesson" };
export const dynamic = "force-dynamic";

export default async function LessonPage({ params }: { params: Promise<{ lessonId: string }> }) {
  const { lessonId } = await params;
  if (!z.string().uuid().safeParse(lessonId).success) notFound();

  const session = await requireSession(`/tutorials/${lessonId}`);
  const data = await getLessonPageData(lessonId, session.userId);
  if (!data) notFound();

  const { lesson, unit, course, outline, flat, content, progress, note, bookmarked, enrolled, resources, completedIds } = data;

  const index = flat.findIndex((l) => l.id === lessonId);
  const prev = index > 0 ? flat[index - 1] : undefined;
  const next = index >= 0 ? flat[index + 1] : undefined;
  const courseProgress = computeCourseProgress(flat.map((l) => l.id), completedIds);

  const completed = progress?.status === "completed";
  const canTrack = enrolled;
  const hasAccess = enrolled || content !== null; // owners/admins can preview without enrolling
  const source = resolveLessonVideo(content?.video_url, content?.video_sources);

  return (
    <DashboardShell session={session}>
      <nav aria-label="Breadcrumb" className="mb-4 text-sm text-forest-600">
        <ol className="flex flex-wrap items-center gap-1.5">
          <li>
            <Link href="/tutorials" className="hover:text-brand-700 hover:underline">
              e-Tutorials
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href={`/courses/${course.slug}`} className="hover:text-brand-700 hover:underline">
              {course.title}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>{unit.title}</li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="font-semibold text-forest-900">
            {lesson.title}
          </li>
        </ol>
      </nav>

      <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="order-2 lg:order-1">
          <div className="rounded-card border border-sage-200 bg-white p-4 shadow-card lg:sticky lg:top-20">
            <h2 className="mb-1 text-sm font-bold text-forest-950">{course.title}</h2>
            {enrolled && <ProgressBar progress={courseProgress} className="mb-4" />}
            <LessonOutline outline={outline} currentLessonId={lesson.id} completedIds={completedIds} />
          </div>
        </aside>

        <section className="order-1 min-w-0 lg:order-2" aria-labelledby="lesson-title">
          {!hasAccess ? (
            <div className="flex flex-col items-center rounded-card border border-dashed border-sage-300 bg-sage-50/60 px-6 py-14 text-center">
              <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sage-100 text-brand-700">
                <Lock className="h-5 w-5" aria-hidden />
              </span>
              <h1 id="lesson-title" className="text-xl font-bold">
                {lesson.title}
              </h1>
              <p className="mt-2 max-w-md text-sm text-forest-600">
                Enrol in <strong>{course.title}</strong> to watch this lesson, take notes and track your progress.
              </p>
              <EnrollButton courseId={course.id} className="mt-5" />
            </div>
          ) : (
            <>
              {source ? (
                <VideoPlayer
                  key={lesson.id}
                  source={source}
                  title={lesson.title}
                  lessonId={lesson.id}
                  startAt={progress?.positionSeconds ?? 0}
                  canSave={canTrack}
                  allowDownload={content?.allow_download !== false}
                />
              ) : (
                <div className="flex aspect-video w-full flex-col items-center justify-center rounded-card border border-dashed border-sage-300 bg-sage-50/60 px-6 text-center">
                  {content?.video_url || (Array.isArray(content?.video_sources) && content.video_sources.length > 0) ? (
                    <>
                      <TriangleAlert className="h-8 w-8 text-forest-500" aria-hidden />
                      <p className="mt-3 font-semibold">This video can&apos;t be shown</p>
                      <p className="mt-1 max-w-sm text-sm text-forest-600">
                        The video link isn&apos;t a supported YouTube or direct video address. Please tell your teacher.
                      </p>
                    </>
                  ) : (
                    <>
                      <VideoOff className="h-8 w-8 text-forest-500" aria-hidden />
                      <p className="mt-3 font-semibold">No video has been added yet</p>
                      <p className="mt-1 max-w-sm text-sm text-forest-600">
                        You can still read the lesson details and use the notes and resources below.
                      </p>
                    </>
                  )}
                </div>
              )}

              <div className="mt-5 flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <h1 id="lesson-title" className="text-2xl font-extrabold">
                    {lesson.title}
                  </h1>
                  {lesson.description && <p className="mt-1.5 max-w-2xl text-forest-700">{lesson.description}</p>}
                </div>
                <BookmarkButton lessonId={lesson.id} initial={bookmarked} showLabel />
              </div>

              {content && content.objectives.length > 0 && (
                <div className="mt-5 rounded-card border border-sage-200 bg-white p-5 shadow-card">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-forest-600">Learning objectives</h2>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-forest-800">
                    {content.objectives.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-y border-sage-200 py-4">
                <div className="flex gap-2">
                  {prev ? (
                    <Link
                      href={`/tutorials/${prev.id}`}
                      className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-sage-300 bg-white px-4 text-sm font-semibold hover:bg-sage-50"
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
                    </Link>
                  ) : (
                    <span className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-sage-200 px-4 text-sm text-forest-500">
                      <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
                    </span>
                  )}
                  {next ? (
                    <Link
                      href={`/tutorials/${next.id}`}
                      className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-sage-300 bg-white px-4 text-sm font-semibold hover:bg-sage-50"
                    >
                      Next <ChevronRight className="h-4 w-4" aria-hidden />
                    </Link>
                  ) : (
                    <span className="inline-flex h-11 items-center gap-1.5 rounded-xl border border-sage-200 px-4 text-sm text-forest-500">
                      Next <ChevronRight className="h-4 w-4" aria-hidden />
                    </span>
                  )}
                </div>
                {canTrack ? (
                  <CompleteButton lessonId={lesson.id} completed={completed} />
                ) : (
                  <p className="text-sm text-forest-600">Preview only. Progress is tracked for enrolled students.</p>
                )}
              </div>

              <div className="mt-6">
                <LessonTabs
                  transcript={
                    content?.transcript ? (
                      <div className="whitespace-pre-wrap text-sm leading-relaxed text-forest-800">{content.transcript}</div>
                    ) : (
                      <EmptyState
                        icon={FileText}
                        title="No transcript yet"
                        description="A written transcript hasn't been added for this lesson."
                      />
                    )
                  }
                  notes={
                    canTrack ? (
                      <NotesEditor lessonId={lesson.id} initial={note} />
                    ) : (
                      <p className="text-sm text-forest-600">Enrol in this course to keep private notes.</p>
                    )
                  }
                  resources={
                    resources.length === 0 ? (
                      <EmptyState
                        icon={FileText}
                        title="No resources for this lesson"
                        description="Related study material will be listed here when it is published."
                      />
                    ) : (
                      <ul className="space-y-2">
                        {resources.map((r) => (
                          <li key={r.id}>
                            <Link
                              href={`/resources/${r.id}`}
                              className="flex items-center gap-3 rounded-xl border border-sage-200 bg-white p-3 hover:bg-sage-50"
                            >
                              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                                <ResourceIcon type={r.resource_type} className="h-4 w-4" />
                              </span>
                              <span className="min-w-0">
                                <span className="block truncate text-sm font-semibold">{r.title}</span>
                                <span className="block text-xs text-forest-500">{RESOURCE_TYPE_INFO[r.resource_type].label}</span>
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )
                  }
                />
              </div>
            </>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
