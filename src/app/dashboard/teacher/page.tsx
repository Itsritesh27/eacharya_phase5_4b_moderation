import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, BookOpen, ClipboardCheck, ClipboardList, FilePlus2, LineChart, Users, type LucideIcon } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { LandscapeArt, type LandscapeVariant } from "@/components/landing/landscape-art";
import { buttonClasses } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { AssessmentAnalyticsRow } from "@/components/reports/assessment-analytics";
import type { GradingItem } from "@/components/grading/grading-queue";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Teacher Dashboard" };
export const dynamic = "force-dynamic";

const VARIANT: Record<number, LandscapeVariant> = { 9: "hills", 10: "farmland", 11: "peaks", 12: "city" };

type MyCourse = { id: string; title: string; slug: string; status: string; class: { grade: number } | { grade: number }[] | null };

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

export default async function TeacherDashboardPage() {
  const session = await requireRole("teacher");
  const supabase = await createClient();

  const [coursesRes, studentsRes, analyticsRes, queueRes] = await Promise.all([
    supabase.from("courses").select("id, title, slug, status, class:classes(grade)").eq("created_by", session.userId).order("created_at", { ascending: false }),
    supabase.rpc("get_teacher_student_progress"),
    supabase.rpc("get_teacher_assessment_analytics"),
    supabase.rpc("get_teacher_grading_queue"),
  ]);

  const courses = (coursesRes.data ?? []) as unknown as MyCourse[];
  const students = (Array.isArray(studentsRes.data) ? studentsRes.data : []) as { student_id: string; course_title: string }[];
  const analytics = (Array.isArray(analyticsRes.data) ? analyticsRes.data : []) as AssessmentAnalyticsRow[];
  const queue = (Array.isArray(queueRes.data) ? queueRes.data : []) as GradingItem[];

  const studentCount = new Set(students.map((s) => s.student_id)).size;
  const studentsByCourse = new Map<string, Set<string>>();
  for (const s of students) {
    if (!studentsByCourse.has(s.course_title)) studentsByCourse.set(s.course_title, new Set());
    studentsByCourse.get(s.course_title)!.add(s.student_id);
  }
  const pending = analytics.reduce((n, r) => n + Number(r.pending_attempts ?? 0), 0) || queue.length;

  const pct = (r: AssessmentAnalyticsRow) => {
    const max = Number(r.max_marks ?? 0);
    const avg = r.average_score === null ? null : Number(r.average_score);
    return avg !== null && max > 0 ? Math.round((avg / max) * 100) : null;
  };
  const withScores = analytics.map((r) => ({ r, p: pct(r) })).filter((x): x is { r: AssessmentAnalyticsRow; p: number } => x.p !== null);
  const avgScore = withScores.length ? Math.round(withScores.reduce((a, b) => a + b.p, 0) / withScores.length) : null;

  const first = session.profile.full_name.trim().split(/\s+/)[0];

  return (
    <DashboardShell session={session}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">{first ? `Welcome back, ${first}!` : "Welcome back!"}</h1>
          <p className="mt-1 text-forest-600">Manage your courses, track student progress and create engaging learning content.</p>
        </div>
        <Link href="/dashboard/teacher/courses/new" className={buttonClasses("primary", "md")}>
          <FilePlus2 className="h-4 w-4" aria-hidden /> Create Course
        </Link>
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Your summary">
        <Stat icon={BookOpen} value={String(courses.length)} label="Courses" tone="bg-brand-50 text-brand-700" />
        <Stat icon={Users} value={String(studentCount)} label="Total students" tone="bg-sky-50 text-sky-700" />
        <Stat icon={ClipboardList} value={String(pending)} label="Pending submissions" tone="bg-amber-50 text-amber-700" />
        <Stat icon={LineChart} value={avgScore === null ? "—" : `${avgScore}%`} label="Average score" tone="bg-brand-50 text-brand-700" />
      </ul>

      <div className="mt-6 grid gap-5 lg:grid-cols-5">
        <section aria-labelledby="mine-h" className="lg:col-span-3">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="mine-h" className="text-lg font-bold">My courses</h2>
            <Link href="/dashboard/teacher/courses" className="text-sm font-semibold text-brand-700 hover:underline">View all</Link>
          </div>
          {courses.length === 0 ? (
            <EmptyState icon={FilePlus2} title="You have no courses yet" description="Use Create Course to start a draft. Courses assigned to you by an administrator also appear here." />
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {courses.slice(0, 4).map((c) => {
                const grade = (Array.isArray(c.class) ? c.class[0]?.grade : c.class?.grade) ?? 9;
                return (
                  <li key={c.id} className="overflow-hidden rounded-card border border-sage-200 bg-white shadow-card">
                    <div className="aspect-[3/1]"><LandscapeArt variant={VARIANT[grade] ?? "hills"} /></div>
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-brand-700">Class {grade}</span>
                        <span className={`rounded-pill px-2 py-0.5 text-xs font-semibold capitalize ${c.status === "published" ? "bg-brand-100 text-brand-800" : "bg-amber-100 text-amber-800"}`}>{c.status}</span>
                      </div>
                      <p className="mt-1 font-bold leading-snug">
                        {c.status === "published" ? <Link href={`/courses/${c.slug}`} className="hover:underline">{c.title}</Link> : c.title}
                      </p>
                      <p className="mt-1 text-xs text-forest-600">{studentsByCourse.get(c.title)?.size ?? 0} students</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-labelledby="queue-h" className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="queue-h" className="text-lg font-bold">Grading queue</h2>
            <Link href="/dashboard/teacher/grading" className="text-sm font-semibold text-brand-700 hover:underline">View all</Link>
          </div>
          <Card>
            {queue.length === 0 ? (
              <CardBody>
                <p className="flex items-center gap-2 text-sm text-forest-600"><ClipboardCheck className="h-4 w-4 text-brand-600" aria-hidden /> No answers awaiting review.</p>
              </CardBody>
            ) : (
              <ul className="divide-y divide-sage-100">
                {queue.slice(0, 4).map((q) => (
                  <li key={`${q.attempt_id}:${q.question_id}`}>
                    <Link href="/dashboard/teacher/grading" className="flex items-center gap-3 px-4 py-3 hover:bg-sage-50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{q.assessment_title}</span>
                        <span className="block truncate text-xs text-forest-500">{q.student_name || "Student"} · Q{q.question_position}</span>
                      </span>
                      <span className="rounded-pill bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Review</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>

      <section aria-labelledby="chart-h" className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="chart-h" className="text-lg font-bold">Assessment analytics</h2>
          <Link href="/dashboard/teacher/analytics" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700 hover:underline">
            <BarChart3 className="h-4 w-4" aria-hidden /> Full report
          </Link>
        </div>
        <Card>
          <CardBody>
            {withScores.length === 0 ? (
              <p className="text-sm text-forest-600">Average scores will appear here once students submit graded assessments.</p>
            ) : (
              <ul className="flex h-44 items-end gap-3" aria-label="Average score per assessment">
                {withScores.slice(0, 8).map(({ r, p }) => (
                  <li key={r.assessment_id} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${r.assessment_title}: ${p}%`}>
                    <span className="text-xs font-semibold text-forest-700">{p}%</span>
                    <span className="w-full max-w-12 rounded-t-lg bg-brand-600" style={{ height: `${Math.max(p, 4) * 0.7}%` }} />
                    <span className="w-full truncate text-center text-[11px] text-forest-500">{r.assessment_title}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </section>
    </DashboardShell>
  );
}
