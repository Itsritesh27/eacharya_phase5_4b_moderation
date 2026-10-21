import { redirect } from "next/navigation";

/** Profile is now shared by every role at /dashboard/profile; keep the old URL working. */
export default function StudentProfileRedirect() {
  redirect("/dashboard/profile");
}
