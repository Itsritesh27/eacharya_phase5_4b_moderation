import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SectionHeading, Welcome } from "@/components/dashboard/welcome";
import { Card, CardBody } from "@/components/ui/card";
import { setUserRoleAction } from "@/lib/auth/actions";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/types/app";

export const metadata: Metadata = { title: "Admin Dashboard" };
export const dynamic = "force-dynamic";

const ROLES: Role[] = ["student", "teacher", "admin"];

export default async function AdminDashboardPage() {
  const session = await requireRole("admin");
  const supabase = await createClient();

  // Admin-only RLS policy allows reading all profiles. Emails are never selected here.
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, role, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const users = (data ?? []) as Pick<Profile, "id" | "full_name" | "role" | "created_at">[];

  const counts = ROLES.map((r) => ({ role: r, count: users.filter((u) => u.role === r).length }));

  return (
    <DashboardShell session={session}>
      <Welcome
        name={session.profile.full_name}
        subtitle="Manage user roles. Every change is verified on the server and enforced again by the database."
      />

      <ul className="mb-10 grid gap-4 sm:grid-cols-3">
        {counts.map(({ role, count }) => (
          <li key={role}>
            <Card>
              <CardBody className="p-4">
                <p className="text-sm capitalize text-forest-600">{role}s</p>
                <p className="mt-1 text-3xl font-extrabold">{count}</p>
              </CardBody>
            </Card>
          </li>
        ))}
      </ul>

      <section id="users" aria-labelledby="users-h">
        <SectionHeading>
          <span id="users-h">Users</span>
        </SectionHeading>
        <div className="overflow-x-auto rounded-card border border-sage-200 bg-white shadow-card">
          <table className="w-full min-w-[32rem] text-left text-sm">
            <caption className="sr-only">Registered users and their roles</caption>
            <thead className="border-b border-sage-200 bg-sage-50 text-xs uppercase tracking-wide text-forest-600">
              <tr>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Role</th>
                <th scope="col" className="px-4 py-3">Change role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sage-100">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-3 font-medium">{u.full_name || "(no name)"}</td>
                  <td className="px-4 py-3 capitalize">{u.role}</td>
                  <td className="px-4 py-3">
                    {u.id === session.userId ? (
                      <span className="text-forest-500">This is you</span>
                    ) : (
                      <form action={setUserRoleAction} className="flex items-center gap-2">
                        <input type="hidden" name="userId" value={u.id} />
                        <label className="sr-only" htmlFor={`role-${u.id}`}>
                          Role for {u.full_name || "user"}
                        </label>
                        <select
                          id={`role-${u.id}`}
                          name="role"
                          defaultValue={u.role}
                          className="h-9 rounded-lg border border-sage-300 bg-white px-2 text-sm capitalize"
                        >
                          {ROLES.map((r) => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" size="sm" variant="secondary">
                          Save
                        </Button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </DashboardShell>
  );
}
