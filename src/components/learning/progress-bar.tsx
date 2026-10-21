import { cn } from "@/lib/utils/cn";
import type { CourseProgress } from "@/lib/learning/progress";

export function ProgressBar({
  progress,
  label = "Course progress",
  className,
}: {
  progress: CourseProgress;
  label?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1 flex items-center justify-between text-xs text-forest-600">
        <span>
          {progress.total === 0 ? "No lessons yet" : `${progress.completed}/${progress.total} lessons`}
        </span>
        <span className="font-semibold text-forest-800">{progress.percent}%</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress.percent}
        className="h-2 overflow-hidden rounded-pill bg-sage-100"
      >
        <div className={cn("h-full rounded-pill bg-brand-600 transition-all")} style={{ width: `${progress.percent}%` }} />
      </div>
    </div>
  );
}
