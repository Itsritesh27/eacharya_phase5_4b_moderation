import Link from "next/link";
import { ChevronDown, LogOut, Settings, UserRound } from "lucide-react";
import { signOutAction } from "@/lib/auth/actions";
import type { Role } from "@/types/app";

const ROLE_LABEL: Record<Role, string> = {
  student: "Student",
  teacher: "Teacher",
  admin: "Administrator",
};

function initials(name: string, fallback: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return letters.join("") || fallback.slice(0, 1).toUpperCase();
}

/** Pure-HTML dropdown (<details>), keyboard accessible without client JS. */
export function ProfileMenu({ name, email, role }: { name: string; email: string | null; role: Role }) {
  const label = name || email || "Account";

  return (
    <details className="relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl p-1.5 pr-2 hover:bg-sage-100 [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-600 text-sm font-bold text-white">
          {initials(name, label)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block max-w-[10rem] truncate text-sm font-semibold leading-tight">{label}</span>
          <span className="block text-xs text-forest-600">{ROLE_LABEL[role]}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-forest-600" aria-hidden />
      </summary>

      <div className="absolute right-0 z-40 mt-2 w-60 rounded-xl border border-sage-200 bg-white p-2 shadow-lift">
        <div className="px-3 py-2">
          <p className="truncate text-sm font-semibold">{label}</p>
          {email && <p className="truncate text-xs text-forest-600">{email}</p>}
        </div>
        <Link href="/dashboard/profile" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-forest-800 hover:bg-sage-100">
          <UserRound className="h-4 w-4" aria-hidden />
          Profile
        </Link>
        <Link href="/dashboard/settings" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-forest-800 hover:bg-sage-100">
          <Settings className="h-4 w-4" aria-hidden />
          Settings
        </Link>
        <form action={signOutAction}>
          <button
            type="submit"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-forest-800 hover:bg-sage-100"
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </button>
        </form>
      </div>
    </details>
  );
}
