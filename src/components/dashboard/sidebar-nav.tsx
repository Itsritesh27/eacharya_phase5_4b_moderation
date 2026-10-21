"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import {
  Award, BarChart3, Bookmark, BookOpen, ClipboardList, FilePlus2, Flag, GraduationCap, LayoutDashboard,
  Library, Map, MessagesSquare, MonitorPlay, Settings, Shield, UserRound, Users, Video,
  type LucideIcon,
} from "lucide-react";
import type { NavIconName, NavSection } from "./nav-config";

// Icons are resolved here, inside the client component, because component
// functions cannot be passed from a Server Component as props.
const ICONS: Record<NavIconName, LucideIcon> = {
  Award, BarChart3, Bookmark, BookOpen, ClipboardList, FilePlus2, Flag, GraduationCap, LayoutDashboard,
  Library, Map, MessagesSquare, MonitorPlay, Settings, Shield, UserRound, Users, Video,
};

export function SidebarNav({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const matches = (base: string) =>
    pathname === base || (base !== "/dashboard/student" && pathname.startsWith(`${base}/`));
  // Only the most specific matching item is highlighted (e.g. Create Course, not My Courses).
  const bestBase = sections
    .flatMap((sec) => sec.items.map((i) => i.href?.split("#")[0]))
    .filter((b): b is string => Boolean(b) && matches(b as string))
    .sort((a, b) => b.length - a.length)[0];

  return (
    <nav aria-label="Dashboard" className="space-y-5">
      {sections.map((section, i) => (
        <div key={section.label ?? i}>
          {section.label && (
            <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-forest-500">{section.label}</p>
          )}
          <ul className="space-y-0.5">
            {section.items.map(({ label, icon, href }) => {
              const Icon = ICONS[icon];
              const base = href ? href.split("#")[0] : undefined;
              const active = Boolean(base) && base === bestBase;
              return (
                <li key={label}>
                  {href ? (
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                        active ? "bg-brand-600 text-white shadow-card" : "text-forest-800 hover:bg-sage-100 hover:text-brand-800",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                      <span className="flex-1">{label}</span>
                    </Link>
                  ) : (
                    <span aria-disabled="true" className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-forest-500">
                      <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
                      <span className="flex-1">{label}</span>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
