import type { Metadata } from "next";
import { AlertTriangle, Video } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SectionHeading } from "@/components/dashboard/welcome";
import { SessionCard } from "@/components/live/session-card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { listSessions } from "@/lib/live-sessions/data";

export const metadata: Metadata = { title: "Live Classes" };
export const dynamic = "force-dynamic";

export default async function StudentLivePage() {
  const session = await requireRole("student");
  const { sessions, missingSchema } = await listSessions();
  const upcoming = sessions.filter((s) => s.status === "scheduled" || s.status === "live").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = sessions.filter((s) => s.status === "ended").slice(0, 10);

  return (
    <DashboardShell session={session}>
      <h1 className="text-2xl font-extrabold sm:text-3xl">Live Classes</h1>
      <p className="mt-1 text-forest-600">Classes for the courses you are enrolled in. The Join button appears 10 minutes before the start.</p>

      {missingSchema && (
        <div className="mt-6 flex gap-3 rounded-card border border-amber-300 bg-amber-50 p-5 text-sm text-forest-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
          <p>Live classes are not available yet. Please check back soon.</p>
        </div>
      )}

      <section className="mt-8" aria-labelledby="up-h">
        <SectionHeading><span id="up-h">Upcoming</span></SectionHeading>
        {upcoming.length === 0 ? (
          <EmptyState icon={Video} title="No upcoming classes" description="When a teacher schedules a class for one of your courses, it appears here." />
        ) : (
          <ul className="space-y-3">{upcoming.map((s) => <SessionCard key={s.id} session={s} role="student" />)}</ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-10" aria-labelledby="past-h">
          <SectionHeading><span id="past-h">Recent classes</span></SectionHeading>
          <ul className="space-y-3">{past.map((s) => <SessionCard key={s.id} session={s} role="student" />)}</ul>
        </section>
      )}
    </DashboardShell>
  );
}
