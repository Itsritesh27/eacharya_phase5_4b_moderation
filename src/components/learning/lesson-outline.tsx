import Link from "next/link";
import { CheckCircle2, ChevronDown, Circle, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface OutlineUnit {
  unitId: string;
  unitTitle: string;
  lessons: { id: string; title: string }[];
}

/** Left-hand lesson navigation for the tutorial page. */
export function LessonOutline({
  outline,
  currentLessonId,
  completedIds,
}: {
  outline: OutlineUnit[];
  currentLessonId: string;
  completedIds: ReadonlySet<string>;
}) {
  return (
    <nav aria-label="Course lessons" className="space-y-2">
      {outline.map((unit, i) => (
        <details
          key={unit.unitId}
          open={unit.lessons.some((l) => l.id === currentLessonId)}
          className="group rounded-xl border border-sage-100 bg-white open:bg-sage-50/40"
        >
          <summary className="flex cursor-pointer list-none items-start gap-2 px-3 py-2.5 [&::-webkit-details-marker]:hidden">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-brand-50 text-[11px] font-bold text-brand-700">
              {i + 1}
            </span>
            <span className="flex-1 text-sm font-semibold leading-snug text-forest-950">{unit.unitTitle.replace(/^Chapter \d+:\s*/, "")}</span>
            <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-forest-500 transition-transform group-open:rotate-180" aria-hidden />
          </summary>
          <div className="px-2 pb-2">
          {unit.lessons.length === 0 ? (
            <p className="text-sm text-forest-500">Video lessons coming soon. Study material is in e-Content.</p>
          ) : (
            <ul className="space-y-1">
              {unit.lessons.map((l) => {
                const current = l.id === currentLessonId;
                const done = completedIds.has(l.id);
                const Icon = current ? PlayCircle : done ? CheckCircle2 : Circle;
                return (
                  <li key={l.id}>
                    <Link
                      href={`/tutorials/${l.id}`}
                      aria-current={current ? "page" : undefined}
                      className={cn(
                        "flex items-start gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors",
                        current ? "bg-brand-50 font-semibold text-brand-800" : "text-forest-800 hover:bg-sage-100",
                      )}
                    >
                      <Icon
                        className={cn("mt-0.5 h-4 w-4 shrink-0", done || current ? "text-brand-600" : "text-forest-500")}
                        aria-hidden
                      />
                      <span>
                        {l.title}
                        {done && <span className="sr-only"> (completed)</span>}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
          </div>
        </details>
      ))}
    </nav>
  );
}
