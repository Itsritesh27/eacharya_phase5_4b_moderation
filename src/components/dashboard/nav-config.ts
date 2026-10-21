import type { Role } from "@/types/app";

export type NavIconName =
  | "Bookmark"
  | "BookOpen"
  | "ClipboardList"
  | "Award"
  | "BarChart3"
  | "FilePlus2"
  | "Flag"
  | "GraduationCap"
  | "LayoutDashboard"
  | "Library"
  | "Map"
  | "MessagesSquare"
  | "MonitorPlay"
  | "Settings"
  | "Shield"
  | "UserRound"
  | "Users"
  | "Video";

export interface NavSection {
  /** Small uppercase group label shown above the items. */
  label?: string;
  items: NavItem[];
}

export interface NavItem {
  label: string;
  /** Icon NAME (a string), resolved inside the client component. Never put a component here. */
  icon: NavIconName;
  /** Omit href for features scheduled for a later phase; they render as disabled. */
  href?: string;
}

export const DASHBOARD_NAV: Record<Role, NavSection[]> = {
  student: [
    { label: "Home", items: [{ label: "Dashboard", icon: "LayoutDashboard", href: "/dashboard/student" }] },
    {
      label: "Learn",
      items: [
        { label: "My Courses", icon: "BookOpen", href: "/dashboard/student/courses" },
        { label: "e-Content", icon: "Library", href: "/dashboard/student/resources" },
        { label: "Live Classes", icon: "Video", href: "/dashboard/student/live" },
        { label: "Geography Lab", icon: "Map", href: "/geography-lab" },
      ],
    },
    {
      label: "Practice",
      items: [
        { label: "Assessments", icon: "ClipboardList", href: "/dashboard/student/assessments" },
        { label: "My Results", icon: "Award", href: "/dashboard/student/results" },
      ],
    },
    { label: "Community", items: [{ label: "Discussion Forum", icon: "MessagesSquare", href: "/forum" }] },
    { label: "Saved", items: [{ label: "Bookmarks", icon: "Bookmark", href: "/dashboard/student/bookmarks" }] },
  ],
  teacher: [
    { label: "Home", items: [{ label: "Overview", icon: "LayoutDashboard", href: "/dashboard/teacher" }] },
    {
      label: "Teach",
      items: [
        { label: "My Courses", icon: "BookOpen", href: "/dashboard/teacher/courses" },
        { label: "Create Course", icon: "FilePlus2", href: "/dashboard/teacher/courses/new" },
        { label: "Videos", icon: "MonitorPlay", href: "/dashboard/teacher/videos" },
        { label: "Live Classes", icon: "Video", href: "/dashboard/teacher/live" },
      ],
    },
    {
      label: "Assess",
      items: [
        { label: "Assessments", icon: "ClipboardList", href: "/dashboard/teacher/assessments" },
        { label: "Submissions", icon: "ClipboardList", href: "/dashboard/teacher/grading" },
        { label: "Analytics & Reports", icon: "BarChart3", href: "/dashboard/teacher/analytics" },
      ],
    },
    {
      label: "People",
      items: [
        { label: "Students", icon: "GraduationCap", href: "/dashboard/teacher/students" },
        { label: "Discussion Forum", icon: "MessagesSquare", href: "/forum" },
      ],
    },
  ],
  admin: [
    { label: "Home", items: [{ label: "Overview", icon: "LayoutDashboard", href: "/dashboard/admin" }] },
    {
      label: "Manage",
      items: [
        { label: "Courses", icon: "BookOpen", href: "/courses" },
        { label: "Users", icon: "Users", href: "/dashboard/admin#users" },
        { label: "Forum Reports", icon: "Flag", href: "/dashboard/admin/forum-reports" },
      ],
    },
    {
      label: "Community",
      items: [{ label: "Discussion Forum", icon: "MessagesSquare", href: "/forum" }],
    },
    {
      label: "System",
      items: [
        { label: "Platform Settings", icon: "Settings", href: "/dashboard/settings" },
        { label: "Security", icon: "Shield", href: "/dashboard/settings#security" },
      ],
    },
  ],
};
