import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandscapeArt, type LandscapeVariant } from "@/components/landing/landscape-art";
import { ProgressBar } from "@/components/learning/progress-bar";
import { courseCounts, type CourseWithClass } from "@/lib/data/curriculum";
import type { CourseProgress } from "@/lib/learning/progress";

const VARIANT_BY_GRADE: Record<number, LandscapeVariant> = {
  9: "hills",
  10: "farmland",
  11: "peaks",
  12: "city",
};

export function CourseCard({
  course,
  progress,
  enrolled = false,
  cta,
}: {
  course: CourseWithClass;
  progress?: CourseProgress;
  enrolled?: boolean;
  cta?: React.ReactNode;
}) {
  const grade = course.class?.grade ?? 9;
  const { unitCount, lessonCount } = courseCounts(course);
  const thumb = course.thumbnail_url?.startsWith("https://") ? course.thumbnail_url : null;

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-card border border-sage-200 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lift">
      <div className="aspect-[2/1] overflow-hidden">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <LandscapeArt variant={VARIANT_BY_GRADE[grade] ?? "hills"} />
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-pill bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">Class {grade}</span>
          {course.subject?.name && (
            <span className="rounded-pill bg-sage-100 px-2.5 py-0.5 text-xs font-medium text-forest-700">
              {course.subject.name}
            </span>
          )}
          {enrolled && (
            <span className="rounded-pill bg-forest-900 px-2.5 py-0.5 text-xs font-semibold text-white">Enrolled</span>
          )}
        </div>
        <h3 className="mt-2 text-base font-bold text-forest-950">
          <Link
            href={`/courses/${course.slug}`}
            className="after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-500"
          >
            {course.title}
          </Link>
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-forest-600">{course.description}</p>
        <p className="mt-2 text-xs text-forest-500">
          {unitCount} unit{unitCount === 1 ? "" : "s"} · {lessonCount} lesson{lessonCount === 1 ? "" : "s"}
        </p>
        {progress && <ProgressBar progress={progress} className="mt-3" />}
        <div className="mt-auto pt-3">
          {cta ?? (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
              {enrolled ? "Continue" : "View course"}
              <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" aria-hidden />
            </span>
          )}
        </div>
      </div>
    </article>
  );
}
