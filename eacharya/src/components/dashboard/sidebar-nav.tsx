"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bookmark, BookOpen, ClipboardList, FilePlus2, Flag, GraduationCap, LayoutDashboard,
  Library, Map, MessagesSquare, MonitorPlay, Settings, Shield, UserRound, Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { NavIconName, NavItem } from "./nav-config";

const ICONS: Record<NavIconName, LucideIcon> = {
  Bookmark, BookOpen, ClipboardList, FilePlus2, Flag, GraduationCap, LayoutDashboard,
  Library, Map, MessagesSquare, MonitorPlay, Settings, Shield, UserRound, Users,
};

export function SidebarNav({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Dashboard">
      <ul className="space-y-1">
        {items.map(({ label, icon, href }) => {
          const Icon = ICONS[icon];
          const base = href ? href.split("#")[0] : undefined;
          const active = base
            ? pathname === base || (base !== "/dashboard/student" && pathname.startsWith(`${base}/`))
            : false;
          const content = (
            <>
              <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
              <span className="flex-1">{label}</span>
              {!href && (
                <span className="rounded-pill bg-sage-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-forest-600">
                  Soon
                </span>
              )}
            </>
          );

          return (
            <li key={label}>
              {href ? (
                <Link
                  href={href}
                  onClick={onNavigate}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-600 text-white"
                      : "text-forest-800 hover:bg-sage-100 hover:text-brand-800",
                  )}
                >
                  {content}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex cursor-not-allowed items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-forest-500"
                >
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
