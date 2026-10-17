"use client";

import { useId } from "react";
import { cn } from "@/lib/utils/cn";
import { FieldError, Input, Label } from "@/components/ui/input";

const controlClass =
  "w-full rounded-xl border border-sage-300 bg-white px-3.5 text-sm text-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 aria-[invalid=true]:border-danger-600 disabled:opacity-60";

interface BaseProps {
  label: string;
  hint?: string;
  error?: string | null;
  className?: string;
}

export function TextField({
  label, hint, error, className, value, onChange, ...rest
}: BaseProps & { value: string; onChange: (v: string) => void } & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "className">) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-forest-600">{hint}</p>}
      <FieldError id={`${id}-err`} message={error ?? undefined} />
    </div>
  );
}

export function SelectField({
  label, hint, error, className, value, onChange, options,
}: BaseProps & { value: string; onChange: (v: string) => void; options: readonly { value: string; label: string }[] }) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={cn(controlClass, "h-11")}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      {hint && <p id={`${id}-hint`} className="mt-1 text-xs text-forest-600">{hint}</p>}
      <FieldError id={`${id}-err`} message={error ?? undefined} />
    </div>
  );
}

export function TextAreaField({
  label, hint, value, onChange, maxLength, minLength, rows = 5,
}: { label: string; hint?: string; value: string; onChange: (v: string) => void; maxLength: number; minLength?: number; rows?: number }) {
  const id = useId();
  const len = value.trim().length;
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      {hint && <p id={`${id}-hint`} className="-mt-1 mb-1.5 text-sm text-forest-600">{hint}</p>}
      <textarea
        id={id}
        value={value}
        rows={rows}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={`${id}-count${hint ? ` ${id}-hint` : ""}`}
        className={cn(controlClass, "py-2.5 leading-relaxed")}
      />
      <p id={`${id}-count`} className="mt-1 text-xs text-forest-600">
        {value.length} / {maxLength} characters{minLength ? ` · at least ${minLength} needed (${len >= minLength ? "done" : `${minLength - len} to go`})` : ""}
      </p>
    </div>
  );
}
