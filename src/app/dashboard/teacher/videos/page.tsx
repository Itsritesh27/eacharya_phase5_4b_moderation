import type { Metadata } from "next";
import Link from "next/link";
import { MonitorPlay } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SectionHeading, Welcome } from "@/components/dashboard/welcome";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { getTeacherChapters } from "@/lib/teacher-videos/data";

export const metadata: Metadata = { title: "Videos" };
export const dynamic = "force-dynamic";

export default async function TeacherVideosPage() {
  const session = await requireRole("teacher");
  const courses = await getTeacherChapters(session.userId);

  return (
    <DashboardShell session={session}>
      <Welcome name={session.profile.full_name} subtitle="Pick a chapter, then paste YouTube links to add its videos." />

      {courses.length === 0 ? (
        <EmptyState
          icon={MonitorPlay}
          title="You have no courses yet"
          description="Videos are added to chapters of courses you created. Courses assigned to you by an administrator will appear here."
        />
      ) : (
        courses.map((c) => (
          <section key={c.courseId} className="mb-8" aria-label={c.title}>
            <SectionHeading>
              <span>
                {c.title}
                <span className="ml-2 rounded-pill bg-sage-100 px-2.5 py-0.5 align-middle text-xs font-semibold capitalize text-forest-700">
                  {c.status}
                </span>
              </span>
            </SectionHeading>
            {c.chapters.length === 0 ? (
              <p className="text-sm text-forest-600">This course has no chapters yet.</p>
            ) : (
              <ul className="divide-y divide-sage-100 rounded-card border border-sage-200 bg-white shadow-card">
                {c.chapters.map((ch, i) => (
                  <li key={ch.unitId}>
                    <Link
                      href={`/dashboard/teacher/videos/${ch.unitId}`}
                      className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-sage-50"
                    >
                      <span className="font-medium">
                        Chapter {i + 1}: {ch.title}
                      </span>
                      <span className="text-sm text-forest-600">
                        {ch.videoCount} video{ch.videoCount === 1 ? "" : "s"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))
      )}
    </DashboardShell>
  );
}
