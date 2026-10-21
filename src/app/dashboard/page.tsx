import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth/session";
import { dashboardPathForRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/** Router page: sends each signed-in user to the dashboard for their server-side role. */
export default async function DashboardIndexPage() {
  const session = await getSessionProfile();
  if (!session) redirect("/sign-in?next=/dashboard");
  redirect(dashboardPathForRole(session.profile.role));
}
