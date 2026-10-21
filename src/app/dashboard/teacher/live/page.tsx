import type { Metadata } from "next";
import { AlertTriangle, Video } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SectionHeading } from "@/components/dashboard/welcome";
import { ScheduleForm } from "@/components/live/schedule-form";
import { SessionCard } from "@/components/live/session-card";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { getTeacherCourses, listSessions } from "@/lib/live-sessions/data";
import { isLiveKitConfigured } from "@/lib/live-sessions/livekit";

export const metadata: Metadata = { title: "Live Classes" };
export const dynamic = "force-dynamic";

export default async function TeacherLivePage() {
  const session = await requireRole("teacher");
  const [{ sessions, missingSchema }, courses] = await Promise.all([listSessions(), getTeacherCourses(session.userId)]);
  const upcoming = sessions.filter((s) => s.status === "scheduled" || s.status === "live").sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const past = sessions.filter((s) => s.status === "ended" || s.status === "cancelled");

  return (
    <DashboardShell session={session}>
      <h1 className="text-2xl font-extrabold sm:text-3xl">Live Classes</h1>
      <p className="mt-1 text-forest-600">Schedule a class for one of your courses. Enrolled students join right here on eAcharya.</p>

      {missingSchema && (
        <div className="mt-6 flex gap-3 rounded-card border border-amber-300 bg-amber-50 p-5 text-sm text-forest-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
          <p>Live classes are not set up in the database yet. Run migration <code>20261103000001_live_classes.sql</code> in Supabase.</p>
        </div>
      )}
      {!isLiveKitConfigured() && (
        <div className="mt-6 flex gap-3 rounded-card border border-amber-300 bg-amber-50 p-5 text-sm text-forest-800">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" aria-hidden />
          <p>The video service is not connected yet. Add <code>LIVEKIT_URL</code>, <code>LIVEKIT_API_KEY</code> and <code>LIVEKIT_API_SECRET</code> to the environment (see LIVE_CLASSES_SETUP.md). You can still schedule classes.</p>
        </div>
      )}

      <section className="mt-8" aria-labelledby="new-h">
        <SectionHeading><span id="new-h">Schedule a class</span></SectionHeading>
        <Card><CardBody><ScheduleForm courses={courses} /></CardBody></Card>
      </section>

      <section className="mt-10" aria-labelledby="up-h">
        <SectionHeading><span id="up-h">Upcoming</span></SectionHeading>
        {upcoming.length === 0 ? (
          <EmptyState icon={Video} title="No upcoming classes" description="Classes you schedule will appear here." />
        ) : (
          <ul className="space-y-3">{upcoming.map((s) => <SessionCard key={s.id} session={s} role="teacher" />)}</ul>
        )}
      </section>

      {past.length > 0 && (
        <section className="mt-10" aria-labelledby="past-h">
          <SectionHeading><span id="past-h">Past</span></SectionHeading>
          <ul className="space-y-3">{past.map((s) => <SessionCard key={s.id} session={s} role="teacher" />)}</ul>
        </section>
      )}
    </DashboardShell>
  );
}
