import { cn } from "@/lib/utils/cn";
import { displayStatus, type DisplayStatus } from "@/lib/assessments/publish";
import type { AssessmentStatus } from "@/types/app";

const STYLES: Record<DisplayStatus, { label: string; cls: string }> = {
  draft: { label: "Draft", cls: "bg-sand-200 text-forest-800" },
  published: { label: "Published", cls: "bg-brand-100 text-brand-800" },
  closed: { label: "Closed", cls: "bg-sage-200 text-forest-700" },
};

export function StatusBadge({ status, closesAt }: { status: AssessmentStatus; closesAt: string | null }) {
  const s = STYLES[displayStatus(status, closesAt, new Date())];
  return (
    <span className={cn("inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-semibold", s.cls)}>
      {s.label}
    </span>
  );
}
