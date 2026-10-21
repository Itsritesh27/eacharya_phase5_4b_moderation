import { useId } from "react";
import { cn } from "@/lib/utils/cn";

const fieldClass =
  "mt-1 h-10 w-full rounded-xl border border-sage-300 bg-white px-3 text-sm text-forest-900 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:opacity-60";

export function SelectField({
  label, value, onChange, children, disabled, hint,
}: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode; disabled?: boolean; hint?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-forest-800">{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={fieldClass} aria-describedby={hint ? `${id}-h` : undefined}>
        {children}
      </select>
      {hint && <p id={`${id}-h`} className="mt-1 text-xs text-forest-600">{hint}</p>}
    </div>
  );
}

export function Pill({ tone = "neutral", children }: { tone?: "neutral" | "warn" | "brand"; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-0.5 text-xs font-semibold",
        tone === "warn" && "bg-amber-100 text-amber-900",
        tone === "brand" && "bg-brand-100 text-brand-800",
        tone === "neutral" && "bg-sage-100 text-forest-700",
      )}
    >
      {children}
    </span>
  );
}

export function SyntheticBanner() {
  return (
    <div role="note" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
      SYNTHETIC DATA: invented for practice. Not official data.
    </div>
  );
}
