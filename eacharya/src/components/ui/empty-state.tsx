import type { LucideIcon } from "lucide-react";

/** Honest placeholder for features not built yet. Never shows fabricated numbers. */
export function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center rounded-card border border-dashed border-sage-300 bg-sage-50/60 px-6 py-10 text-center">
      <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-sage-100 text-brand-700">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <h3 className="text-base font-semibold text-forest-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-forest-600">{description}</p>
    </div>
  );
}
