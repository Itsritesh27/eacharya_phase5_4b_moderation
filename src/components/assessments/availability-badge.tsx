import { cn } from "@/lib/utils/cn";
import type { Availability } from "@/lib/assessments/availability";

const STYLES: Record<Availability, { label: string; cls: string }> = {
  open: { label: "Open now", cls: "bg-brand-100 text-brand-800" },
  upcoming: { label: "Opens later", cls: "bg-sand-200 text-forest-800" },
  closed: { label: "Closed", cls: "bg-sage-200 text-forest-700" },
};

export function AvailabilityBadge({ value }: { value: Availability }) {
  const s = STYLES[value];
  return (
    <span className={cn("inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-semibold", s.cls)}>
      {s.label}
    </span>
  );
}
