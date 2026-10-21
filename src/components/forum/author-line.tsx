import { cn } from "@/lib/utils/cn";
import type { AuthorCard } from "@/lib/forum/types";

const ROLE_LABEL = { student: "Student", teacher: "Teacher", admin: "Admin" } as const;

/** The badge text comes from profiles.role in the database (via forum_author_cards), never from the browser. */
export function RoleBadge({ role }: { role: keyof typeof ROLE_LABEL }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold",
        role === "student" ? "bg-sage-100 text-forest-800" : "bg-brand-100 text-brand-800",
      )}
    >
      {ROLE_LABEL[role]}
    </span>
  );
}

export function AuthorLine({ author }: { author: AuthorCard | undefined }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-semibold text-forest-900">{author?.name ?? "eAcharya member"}</span>
      {author && <RoleBadge role={author.role} />}
    </span>
  );
}
