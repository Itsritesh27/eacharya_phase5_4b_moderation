import type { Metadata } from "next";
import Link from "next/link";
import { BookX } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SectionHeading } from "@/components/dashboard/welcome";
import { CourseCard } from "@/components/curriculum/course-card";
import { EnrollButton } from "@/components/learning/enroll-button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { getPublishedCourses } from "@/lib/data/curriculum";
import { getEnrolledCourses } from "@/lib/data/learning";

export const metadata: Metadata = { title: "My Courses" };
export const dynamic = "force-dynamic";

export default async function StudentCoursesPage() {
  const session = await requireRole("student");
  const [enrolled, all] = await Promise.all([getEnrolledCourses(session.userId), getPublishedCourses()]);

  const enrolledIds = new Set(enrolled.map((e) => e.course.id));
  const available = all.filter((c) => !enrolledIds.has(c.id));

  return (
    <DashboardShell session={session}>
      <h1 className="text-2xl font-extrabold sm:text-3xl">My Courses</h1>
      <p className="mt-1 text-forest-600">Courses you are enrolled in, and more to explore.</p>

      <section aria-labelledby="enrolled-h" className="mt-8">
        <SectionHeading>
          <span id="enrolled-h">Enrolled</span>
        </SectionHeading>
        {enrolled.length === 0 ? (
          <EmptyState
            icon={BookX}
            title="You haven't enrolled in any courses"
            description="Pick a course below and choose Enrol to get started."
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {enrolled.map((e) => (
              <li key={e.course.id}>
                <CourseCard course={e.course} progress={e.progress} enrolled />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="avail-h" className="mt-10">
        <SectionHeading
          action={
            <Link href="/courses" className="text-sm font-semibold text-brand-700 hover:underline">
              Public catalogue
            </Link>
          }
        >
          <span id="avail-h">Available to enrol</span>
        </SectionHeading>
        {available.length === 0 ? (
          <EmptyState
            icon={BookX}
            title="No other published courses"
            description="You are enrolled in every published course, or none have been published yet."
          />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {available.map((c) => (
              <li key={c.id}>
                <CourseCard course={c} cta={<span className="relative z-10 block"><EnrollButton courseId={c.id} size="sm" /></span>} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </DashboardShell>
  );
}
