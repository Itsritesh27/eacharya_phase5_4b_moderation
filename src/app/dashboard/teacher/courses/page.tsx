import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { LandscapeArt, type LandscapeVariant } from "@/components/landing/landscape-art";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My Courses" };
export const dynamic = "force-dynamic";

const VARIANT: Record<number, LandscapeVariant> = { 9: "hills", 10: "farmland", 11: "peaks", 12: "city" };
type Row = { id: string; title: string; slug: string; description: string; status: string; class: { grade: number } | { grade: number }[] | null };

export default async function TeacherCoursesPage() {
  const session = await requireRole("teacher");
  const supabase = await createClient();
  const { data } = await supabase
    .from("courses")
    .select("id, title, slug, description, status, class:classes(grade)")
    .eq("created_by", session.userId)
    .order("created_at", { ascending: false });
  const courses = (data ?? []) as unknown as Row[];

  return (
    <DashboardShell session={session}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">My Courses</h1>
          <p className="mt-1 text-forest-600">Courses you created or were assigned. Drafts are published by an administrator.</p>
        </div>
        <Link href="/dashboard/teacher/courses/new" className={buttonClasses("primary", "md")}>
          <FilePlus2 className="h-4 w-4" aria-hidden /> Create Course
        </Link>
      </div>
      <div className="mt-8">
        {courses.length === 0 ? (
          <EmptyState icon={FilePlus2} title="You have no courses yet" description="Use Create Course to start a draft." />
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {courses.map((c) => {
              const grade = (Array.isArray(c.class) ? c.class[0]?.grade : c.class?.grade) ?? 9;
              return (
                <li key={c.id} className="overflow-hidden rounded-card border border-sage-200 bg-white shadow-card">
                  <div className="aspect-[2/1]"><LandscapeArt variant={VARIANT[grade] ?? "hills"} /></div>
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-brand-700">Class {grade}</span>
                      <span className={`rounded-pill px-2 py-0.5 text-xs font-semibold capitalize ${c.status === "published" ? "bg-brand-100 text-brand-800" : "bg-amber-100 text-amber-800"}`}>{c.status}</span>
                    </div>
                    <p className="mt-1 font-bold leading-snug">
                      {c.status === "published" ? <Link href={`/courses/${c.slug}`} className="hover:underline">{c.title}</Link> : c.title}
                    </p>
                    <p className="mt-1 line-clamp-2 text-sm text-forest-600">{c.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </DashboardShell>
  );
}
