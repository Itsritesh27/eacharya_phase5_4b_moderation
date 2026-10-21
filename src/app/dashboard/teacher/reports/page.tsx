import { redirect } from "next/navigation";

/** Keep old bookmarks working while consolidating reports into analytics. */
export default function TeacherReportsPage() {
  redirect("/dashboard/teacher/analytics");
}
