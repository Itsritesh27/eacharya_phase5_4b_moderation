import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen, BookX, CalendarClock, CheckCircle2, ClipboardList, LineChart, PlayCircle, type LucideIcon } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { CourseCard } from "@/components/curriculum/course-card";
import { LandscapeArt, type LandscapeVariant } from "@/components/landing/landscape-art";
import { ProgressBar } from "@/components/learning/progress-bar";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { listStudentAssessments, type StudentAssessment } from "@/lib/assessments/student-data";
import { getEnrolledCourses, getRecentLessons } from "@/lib/data/learning";
import { createClient } from "@/lib/supabase/server";
import { combineProgress } from "@/lib/learning/progress";

export const metadata: Metadata = { title: "Student Dashboard" };
export const dynamic = "force-dynamic";

const VARIANT: Record<number, LandscapeVariant> = { 9: "hills", 10: "farmland", 11: "peaks", 12: "city" };
const dateFmt = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });

function Stat({ icon: Icon, value, label, tone }: { icon: LucideIcon; value: string; label: string; tone: string }) {
  return (
    <li className="flex items-center gap-3 rounded-card border border-sage-200 bg-white p-4 shadow-card">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div>
        <p className="text-2xl font-extrabold leading-none text-forest-950">{value}</p>
        <p className="mt-1 text-xs text-forest-600">{label}</p>
      </div>
    </li>
  );
}

export default async function StudentDashboardPage() {
  const session = await requireRole("student");
  const supabase = await createClient();

  const [enrolled, recent, assessments, results] = await Promise.all([
    getEnrolledCourses(session.userId),
    getRecentLessons(session.userId, 5),
    listStudentAssessments().catch(() => [] as StudentAssessment[]),
    supabase.rpc("get_my_results").then((r) => (Array.isArray(r.data) ? r.data : []) as { assessment_id: string; percentage: number | null }[]),
  ]);

  const overall = combineProgress(enrolled.map((e) => e.progress));
  const resume = recent.find((r) => r.status === "in_progress") ?? recent[0] ?? null;
  const resumeCourse = resume ? enrolled.find((e) => e.course.title === resume.courseTitle) : undefined;

  const doneIds = new Set(results.map((r) => r.assessment_id));
  const upcoming = assessments.filter((a) => a.availability !== "closed" && !doneIds.has(a.id));
  const scored = results.map((r) => r.percentage).filter((p): p is number => typeof p === "number");
  const avg = scored.length ? Math.round(scored.reduce((a, b) => a + b, 0) / scored.length) : null;

  const first = session.profile.full_name.trim().split(/\s+/)[0];

  return (
    <DashboardShell session={session}>
      <h1 className="text-2xl font-extrabold sm:text-3xl">{first ? `Welcome back, ${first}!` : "Welcome back!"}</h1>
      <p className="mt-1 text-forest-600">Continue your learning journey and explore the fascinating world of Geography.</p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Your summary">
        <Stat icon={CheckCircle2} value={String(overall.completed)} label="Lessons completed" tone="bg-brand-50 text-brand-700" />
        <Stat icon={ClipboardList} value={String(upcoming.length)} label="Assessments pending" tone="bg-amber-50 text-amber-700" />
        <Stat icon={LineChart} value={avg === null ? "—" : `${avg}%`} label="Average score" tone="bg-brand-50 text-brand-700" />
        <Stat icon={BookOpen} value={String(enrolled.length)} label="Courses enrolled" tone="bg-sky-50 text-sky-700" />
      </ul>

      <div className="mt-6 grid gap-5 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardBody>
            <h2 className="text-lg font-bold">Continue learning</h2>
            {resume ? (
              <div className="mt-4 flex flex-col gap-4 sm:flex-row">
                <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-xl sm:w-48">
                  <LandscapeArt variant={VARIANT[resumeCourse?.course.class?.grade ?? 9] ?? "hills"} />
                  <span className="absolute inset-0 flex items-center justify-center bg-forest-950/20">
                    <PlayCircle className="h-10 w-10 text-white drop-shadow" aria-hidden />
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <span className="rounded-pill bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">{resume.courseTitle}</span>
                  <p className="mt-2 text-lg font-bold leading-snug">{resume.lessonTitle}</p>
                  <p className="text-sm text-forest-600">{resume.unitTitle}</p>
                  {resumeCourse && <ProgressBar className="mt-3" progress={resumeCourse.progress} />}
                  <Link href={`/tutorials/${resume.lessonId}`} className={buttonClasses("primary", "md", "mt-4")}>
                    Continue learning <ArrowRight className="h-4 w-4" aria-hidden />
                  </Link>
                </div>
              </div>
            ) : (
              <div className="mt-4">
                <EmptyState
                  icon={PlayCircle}
                  title="Nothing in progress yet"
                  description={enrolled.length === 0 ? "Enrol in a course and open a lesson to start learning." : "Open a lesson from one of your courses to start learning."}
                />
              </div>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardBody>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold">Upcoming assessments</h2>
              <Link href="/dashboard/student/assessments" className="text-sm font-semibold text-brand-700 hover:underline">View all</Link>
            </div>
            {upcoming.length === 0 ? (
              <p className="mt-4 text-sm text-forest-600">No pending assessments right now.</p>
            ) : (
              <ul className="mt-3 divide-y divide-sage-100">
                {upcoming.slice(0, 3).map((a) => (
                  <li key={a.id}>
                    <Link href={`/dashboard/student/assessments/${a.id}`} className="flex items-center gap-3 py-3 hover:bg-sage-50">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                        <ClipboardList className="h-4 w-4" aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{a.title}</span>
                        <span className="block truncate text-xs text-forest-500">{a.courseTitle}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs text-forest-600">
                        <CalendarClock className="h-3.5 w-3.5" aria-hidden />
                        {a.closesAt ? dateFmt.format(new Date(a.closesAt)) : a.availability === "upcoming" ? "Soon" : "Open"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <section aria-labelledby="courses-h" className="mt-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id="courses-h" className="text-lg font-bold">My enrolled courses</h2>
          <Link href="/dashboard/student/courses" className="text-sm font-semibold text-brand-700 hover:underline">View all</Link>
        </div>
        {enrolled.length === 0 ? (
          <>
            <EmptyState icon={BookX} title="You haven't enrolled in any courses" description="Browse the published Geography courses and enrol to see them here." />
            <div className="mt-4">
              <Link href="/dashboard/student/courses" className={buttonClasses("secondary", "md")}>Browse courses</Link>
            </div>
          </>
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {enrolled.slice(0, 4).map((e) => (
              <li key={e.course.id}>
                <CourseCard course={e.course} progress={e.progress} enrolled />
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}
