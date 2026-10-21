import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { CreateCourseForm } from "@/components/courses/create-course-form";
import { Card, CardBody } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getActiveClasses } from "@/lib/data/curriculum";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Create Course" };
export const dynamic = "force-dynamic";

export default async function CreateCoursePage() {
  const session = await requireRole("teacher");
  const supabase = await createClient();
  const classes = await getActiveClasses();
  const { data } = await supabase.from("subjects").select("id, name").eq("is_active", true).order("name");
  const subjects = (data ?? []) as { id: string; name: string }[];

  return (
    <DashboardShell session={session}>
      <h1 className="text-2xl font-extrabold sm:text-3xl">Create Course</h1>
      <p className="mt-1 text-forest-600">New courses start as drafts that only you and administrators can see.</p>
      <Card className="mt-8 max-w-2xl">
        <CardBody>
          <CreateCourseForm
            classes={classes.map((c) => ({ id: c.id, label: `Class ${c.grade}` }))}
            subjects={subjects.map((s) => ({ id: s.id, label: s.name }))}
          />
        </CardBody>
      </Card>
    </DashboardShell>
  );
}
