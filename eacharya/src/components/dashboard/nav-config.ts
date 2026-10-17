import {
  Bookmark,
  BookOpen,
  ClipboardList,
  FilePlus2,
  Flag,
  GraduationCap,
  LayoutDashboard,
  Library,
  Map,
  MessagesSquare,
  MonitorPlay,
  Settings,
  Shield,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { Role } from "@/types/app";

export interface NavItem {
  label: string;
  icon: LucideIcon;
  /** Omit href for features scheduled for a later phase; they render as disabled. */
  href?: string;
}

export const DASHBOARD_NAV: Record<Role, NavItem[]> = {
  student: [
    { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard/student" },
    { label: "My Courses", icon: BookOpen, href: "/dashboard/student/courses" },
    { label: "e-Tutorials", icon: MonitorPlay, href: "/tutorials" },
    { label: "e-Content", icon: Library, href: "/dashboard/student/resources" },
    { label: "Geography Lab", icon: Map, href: "/geography-lab" },
    { label: "Discussion Forum", icon: MessagesSquare, href: "/forum" },
    { label: "Assessments", icon: ClipboardList, href: "/dashboard/student/assessments" },
    { label: "Bookmarks", icon: Bookmark, href: "/dashboard/student/bookmarks" },
    { label: "Profile", icon: UserRound, href: "/dashboard/student/profile" },
    { label: "Settings", icon: Settings },
  ],
  teacher: [
    { label: "Overview", icon: LayoutDashboard, href: "/dashboard/teacher" },
    { label: "Curriculum", icon: BookOpen, href: "/courses" },
    { label: "Create Course", icon: FilePlus2 },
    { label: "Assessments", icon: ClipboardList, href: "/dashboard/teacher/assessments" },
    { label: "Discussion Forum", icon: MessagesSquare, href: "/forum" },
    { label: "Students", icon: GraduationCap },
    { label: "Submissions", icon: ClipboardList },
  ],
  admin: [
    { label: "Overview", icon: LayoutDashboard, href: "/dashboard/admin" },
    { label: "Curriculum", icon: BookOpen, href: "/courses" },
    { label: "Discussion Forum", icon: MessagesSquare, href: "/forum" },
    { label: "Forum Reports", icon: Flag, href: "/dashboard/admin/forum-reports" },
    { label: "Users", icon: Users, href: "/dashboard/admin#users" },
    { label: "Platform Settings", icon: Settings },
    { label: "Security", icon: Shield },
  ],
};
