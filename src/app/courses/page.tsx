import type { Metadata } from "next";
import Link from "next/link";
import { BookX } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { CourseCard } from "@/components/curriculum/course-card";
import { EmptyState } from "@/components/ui/empty-state";
import { getPublishedCourses } from "@/lib/data/curriculum";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = { title: "Courses" };

const GRADES = [9, 10, 11, 12] as const;

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string }>;
}) {
  const { grade: gradeParam } = await searchParams;
  const parsed = Number(gradeParam);
  const grade = GRADES.includes(parsed as (typeof GRADES)[number]) ? parsed : undefined;

  const courses = await getPublishedCourses(grade);

  return (
    <PageShell>
      <div className="container-page py-12">
        <h1 className="text-3xl font-extrabold sm:text-4xl">Geography Courses</h1>
        <p className="mt-2 max-w-2xl text-forest-600">
          Explore NCERT-aligned Geography study guides, chapter worksheets and official textbook links for Classes 9–12. Teachers can add video lessons and additional resources.
        </p>

        <nav aria-label="Filter by class" className="mt-6 flex flex-wrap gap-2">
          {[undefined, ...GRADES].map((g) => {
            const active = g === grade;
            return (
              <Link
                key={g ?? "all"}
                href={g ? `/courses?grade=${g}` : "/courses"}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "rounded-pill border px-4 py-1.5 text-sm font-medium",
                  active
                    ? "border-brand-600 bg-brand-600 text-white"
                    : "border-sage-300 bg-white text-forest-800 hover:bg-sage-100",
                )}
              >
                {g ? `Class ${g}` : "All classes"}
              </Link>
            );
          })}
        </nav>

        <div className="mt-8">
          {courses.length === 0 ? (
            <EmptyState
              icon={BookX}
              title="No published courses yet"
              description={
                grade
                  ? `There are no published courses for Class ${grade} yet. Please check back soon.`
                  : "No courses have been published yet. Please check back soon."
              }
            />
          ) : (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((c) => (
                <li key={c.id}>
                  <CourseCard course={c} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </PageShell>
  );
}
