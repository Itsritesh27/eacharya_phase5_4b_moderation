import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Bookmark, BookX, History, Library, Map, MessagesSquare, MonitorPlay, ClipboardList, PlayCircle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SectionHeading, Welcome } from "@/components/dashboard/welcome";
import { CourseCard } from "@/components/curriculum/course-card";
import { ProgressBar } from "@/components/learning/progress-bar";
import { ResourceIcon } from "@/components/resources/resource-icon";
import { RESOURCE_TYPE_INFO } from "@/components/resources/resource-icon";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { getBookmarks, getEnrolledCourses, getRecentLessons, getRecentResources } from "@/lib/data/learning";
import { combineProgress } from "@/lib/learning/progress";

export const metadata: Metadata = { title: "Student Dashboard" };
export const dynamic = "force-dynamic";

const QUICK = [
  { label: "e-Tutorials", icon: MonitorPlay, href: "/tutorials", note: "Watch video lessons" },
  { label: "e-Content", icon: Library, href: "/dashboard/student/resources", note: "Notes, PDFs and links" },
  { label: "Geography Lab", icon: Map, href: "/geography-lab", note: "Maps and activities" },
  { label: "Discussions", icon: MessagesSquare, href: "/forum", note: "Questions and answers" },
  { label: "Assessments", icon: ClipboardList, note: "Coming soon" },
] as const;

export default async function StudentDashboardPage() {
  const session = await requireRole("student");
  const [enrolled, recent, bookmarks, resources] = await Promise.all([
    getEnrolledCourses(session.userId),
    getRecentLessons(session.userId, 5),
    getBookmarks(session.userId, 4),
    getRecentResources(4),
  ]);

  const overall = combineProgress(enrolled.map((e) => e.progress));

  const resume = recent.find((r) => r.status === "in_progress") ?? null;

  return (
    <DashboardShell session={session}>
      <Welcome name={session.profile.full_name} subtitle="Continue your Geography learning journey." />

      <div className="mb-10 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardBody>
            <h2 className="text-lg font-bold">Continue learning</h2>
            {resume ? (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                    <PlayCircle className="h-6 w-6" aria-hidden />
                  </span>
                  <div>
                    <p className="text-xs font-semibold text-brand-700">{resume.courseTitle}</p>
                    <p className="font-semibold">{resume.lessonTitle}</p>
                    <p className="text-sm text-forest-600">{resume.unitTitle}</p>
                  </div>
                </div>
                <Link href={`/tutorials/${resume.lessonId}`} className={buttonClasses("primary", "md")}>
                  Resume <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState
                  icon={PlayCircle}
                  title="Nothing in progress yet"
                  description={
                    enrolled.length === 0
                      ? "Enrol in a course and open a lesson to start learning."
                      : "Open a lesson from one of your courses to start learning."
                  }
                />
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardBody>
            <h2 className="text-lg font-bold">My progress</h2>
            {enrolled.length === 0 ? (
              <p className="mt-3 text-sm text-forest-600">Your progress will appear here after you enrol in a course.</p>
            ) : (
              <div className="mt-4">
                <ProgressBar progress={overall} label="Overall progress" />
                <p className="mt-3 text-sm text-forest-600">
                  {enrolled.length} course{enrolled.length === 1 ? "" : "s"} · {overall.completed} of {overall.total} lessons
                  completed
                </p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <section aria-labelledby="quick-h" className="mb-10">
        <SectionHeading>
          <span id="quick-h">Quick access</span>
        </SectionHeading>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {QUICK.map(({ label, icon: Icon, note, ...rest }) => {
            const href = "href" in rest ? rest.href : undefined;
            const inner = (
              <>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-100 text-brand-700">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="mt-3 block text-sm font-semibold">{label}</span>
                <span className="block text-xs text-forest-600">{note}</span>
              </>
            );
            return (
              <li key={label}>
                {href ? (
                  <Link
                    href={href}
                    className="block h-full rounded-card border border-sage-200 bg-white p-4 shadow-card transition hover:shadow-lift"
                  >
                    {inner}
                  </Link>
                ) : (
                  <div aria-disabled="true" className="h-full rounded-card border border-dashed border-sage-300 bg-sage-50/60 p-4 opacity-80">
                    {inner}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="courses-h" className="mb-10">
        <SectionHeading
          action={
            <Link href="/dashboard/student/courses" className="text-sm font-semibold text-brand-700 hover:underline">
              All my courses
            </Link>
          }
        >
          <span id="courses-h">My courses</span>
        </SectionHeading>
        {enrolled.length === 0 ? (
          <EmptyState
            icon={BookX}
            title="You haven't enrolled in any courses"
            description="Browse the published Geography courses and enrol to see them here."
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {enrolled.slice(0, 3).map((e) => (
              <li key={e.course.id}>
                <CourseCard course={e.course} progress={e.progress} enrolled />
              </li>
            ))}
          </ul>
        )}
        {enrolled.length === 0 && (
          <div className="mt-4">
            <Link href="/courses" className={buttonClasses("secondary", "md")}>
              Browse courses
            </Link>
          </div>
        )}
      </section>

      <div className="mb-10 grid gap-5 lg:grid-cols-2">
        <section aria-labelledby="recent-h">
          <SectionHeading>
            <span id="recent-h">Recent lessons</span>
          </SectionHeading>
          {recent.length === 0 ? (
            <EmptyState icon={History} title="No recent lessons" description="Lessons you open will be listed here." />
          ) : (
            <ul className="divide-y divide-sage-100 rounded-card border border-sage-200 bg-white shadow-card">
              {recent.map((r) => (
                <li key={r.lessonId}>
                  <Link href={`/tutorials/${r.lessonId}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-sage-50">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{r.lessonTitle}</span>
                      <span className="block truncate text-xs text-forest-500">{r.courseTitle}</span>
                    </span>
                    <span className="shrink-0 rounded-pill bg-sage-100 px-2.5 py-0.5 text-xs font-medium text-forest-700">
                      {r.status === "completed" ? "Completed" : "In progress"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="bm-h">
          <SectionHeading
            action={
              <Link href="/dashboard/student/bookmarks" className="text-sm font-semibold text-brand-700 hover:underline">
                View all
              </Link>
            }
          >
            <span id="bm-h">Bookmarks</span>
          </SectionHeading>
          {bookmarks.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="No bookmarks yet"
              description="Bookmark lessons and resources to find them quickly."
            />
          ) : (
            <ul className="divide-y divide-sage-100 rounded-card border border-sage-200 bg-white shadow-card">
              {bookmarks.map((b) => (
                <li key={b.id}>
                  <Link
                    href={b.lesson ? `/tutorials/${b.lesson.lessonId}` : `/resources/${b.resource?.id}`}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-sage-50"
                  >
                    <Bookmark className="h-4 w-4 shrink-0 text-brand-600" aria-hidden />
                    <span className="truncate text-sm font-semibold">{b.lesson?.lessonTitle ?? b.resource?.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section aria-labelledby="res-h">
        <SectionHeading
          action={
            <Link href="/dashboard/student/resources" className="text-sm font-semibold text-brand-700 hover:underline">
              Open library
            </Link>
          }
        >
          <span id="res-h">Recently available resources</span>
        </SectionHeading>
        {resources.length === 0 ? (
          <EmptyState icon={Library} title="No resources yet" description="New study material will appear here." />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {resources.map((r) => (
              <li key={r.id}>
                <Link
                  href={`/resources/${r.id}`}
                  className="flex h-full items-start gap-3 rounded-card border border-sage-200 bg-white p-4 shadow-card transition hover:shadow-lift"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                    <ResourceIcon type={r.resource_type} className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{r.title}</span>
                    <span className="block text-xs text-forest-500">{RESOURCE_TYPE_INFO[r.resource_type].label}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}
