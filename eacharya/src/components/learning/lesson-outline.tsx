import Link from "next/link";
import { CheckCircle2, Circle, PlayCircle } from "lucide-react";
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
    <nav aria-label="Course lessons" className="space-y-5">
      {outline.map((unit, i) => (
        <div key={unit.unitId}>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-forest-600">
            Unit {i + 1}: {unit.unitTitle}
          </h3>
          {unit.lessons.length === 0 ? (
            <p className="text-sm text-forest-500">No lessons yet.</p>
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
      ))}
    </nav>
  );
}
