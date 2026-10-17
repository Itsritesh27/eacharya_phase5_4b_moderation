import type { Metadata } from "next";
import Link from "next/link";
import { ClipboardList, FilePlus2 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SectionHeading, Welcome } from "@/components/dashboard/welcome";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getActiveClasses } from "@/lib/data/curriculum";
import type { CourseRow } from "@/types/app";

export const metadata: Metadata = { title: "Teacher Dashboard" };
export const dynamic = "force-dynamic";

export default async function TeacherDashboardPage() {
  const session = await requireRole("teacher");
  const supabase = await createClient();

  // RLS limits this to courses this teacher created.
  const { data } = await supabase
    .from("courses")
    .select("id, title, slug, status")
    .eq("created_by", session.userId)
    .order("created_at", { ascending: false });
  const myCourses = (data ?? []) as Pick<CourseRow, "id" | "title" | "slug" | "status">[];
  const classes = await getActiveClasses();

  return (
    <DashboardShell session={session}>
      <Welcome
        name={session.profile.full_name}
        subtitle="View the curriculum structure and manage the courses you are authorised to edit."
      />

      <section aria-labelledby="mine-h" className="mb-10">
        <SectionHeading>
          <span id="mine-h">Your courses</span>
        </SectionHeading>
        {myCourses.length === 0 ? (
          <EmptyState
            icon={FilePlus2}
            title="You have no courses yet"
            description="Course creation tools arrive in a later phase. Courses assigned to you by an administrator will appear here."
          />
        ) : (
          <ul className="divide-y divide-sage-100 rounded-card border border-sage-200 bg-white shadow-card">
            {myCourses.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3.5">
                <span className="font-medium">{c.title}</span>
                <span className="rounded-pill bg-sage-100 px-2.5 py-0.5 text-xs font-semibold capitalize text-forest-700">
                  {c.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="structure-h" className="mb-10">
        <SectionHeading
          action={
            <Link href="/courses" className="text-sm font-semibold text-brand-700 hover:underline">
              Browse curriculum
            </Link>
          }
        >
          <span id="structure-h">Curriculum structure</span>
        </SectionHeading>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {classes.map((c) => (
            <li key={c.id}>
              <Card>
                <CardBody className="p-4">
                  <p className="font-bold">{c.name}</p>
                  <p className="mt-1 text-sm text-forest-600">{c.description}</p>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <EmptyState
        icon={ClipboardList}
        title="Submissions and analytics are coming"
        description="Student submissions and class performance will appear here once assessments are built."
      />
    </DashboardShell>
  );
}
