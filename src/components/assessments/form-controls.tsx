import * as React from "react";
import { cn } from "@/lib/utils/cn";

const control =
  "w-full rounded-xl border border-sage-300 bg-white px-3.5 text-sm text-forest-900 " +
  "placeholder:text-forest-500/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 " +
  "aria-[invalid=true]:border-danger-600 disabled:cursor-not-allowed disabled:bg-sage-50 disabled:opacity-70";

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, rows = 4, ...props }, ref) {
    return <textarea ref={ref} rows={rows} className={cn(control, "py-2.5", className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, ...props }, ref) {
    return <select ref={ref} className={cn(control, "h-11", className)} {...props} />;
  },
);

export function Hint({ id, children }: { id?: string; children: React.ReactNode }) {
  return (
    <p id={id} className="mt-1.5 text-xs text-forest-600">
      {children}
    </p>
  );
}

/** Empty string -> null, otherwise a number (NaN if not numeric, which validation reports). */
export function numberOrNull(value: string): number | null {
  const v = value.trim();
  return v === "" ? null : Number(v);
}

export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function fromLocalInput(value: string): string | null {
  if (value === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
