import Link from "next/link";
import { cn } from "@/lib/utils/cn";

function GlobeMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="14" fill="#0b6b4a" />
      <path
        d="M8 13c2-3 5-4 7-3s1 3-1 4-3 3-1 5 0 4-3 3-4-5-2-9Zm11-4c2-1 5 0 6 2s-1 3-3 3-4-3-3-5Zm2 10c2-1 4 0 4 2s-2 4-4 3-2-4 0-5Z"
        fill="#80c9a9"
      />
      <path d="M2 18c4 2 8 1 12 3s9 3 16-2" fill="none" stroke="#d9efe5" strokeWidth="1.2" opacity=".6" />
    </svg>
  );
}

export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2", className)} aria-label="eAcharya home">
      <GlobeMark className="h-8 w-8" />
      <span className="text-xl font-extrabold tracking-tight text-forest-950">
        e<span className="text-brand-600">Acharya</span>
      </span>
    </Link>
  );
}
