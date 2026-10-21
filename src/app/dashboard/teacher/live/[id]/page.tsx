import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Users } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { formatWhen } from "@/components/live/session-card";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { getAttendance, getSession } from "@/lib/live-sessions/data";
import { formatDuration } from "@/lib/live-sessions/rules";
import { idSchema } from "@/lib/live-sessions/validation";

export const metadata: Metadata = { title: "Class attendance" };
export const dynamic = "force-dynamic";

export default async function AttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const session = await requireRole("teacher");
  const live = await getSession(id);
  if (!live || live.createdBy !== session.userId) notFound();
  const rows = await getAttendance(id);

  const present = rows.filter((r) => r.firstJoinedAt).length;
  const classSeconds = live.durationMinutes * 60;

  return (
    <DashboardShell session={session}>
      <Link href="/dashboard/teacher/live" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Live Classes
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold sm:text-3xl">{live.title}</h1>
      <p className="mt-1 text-forest-600">{live.courseTitle} · {formatWhen(live.startsAt)} · {live.durationMinutes} min · <span className="capitalize">{live.status}</span></p>

      <p className="mt-6 text-sm font-semibold text-forest-800">{present} of {rows.length} enrolled students joined</p>

      <div className="mt-4">
        {rows.length === 0 ? (
          <EmptyState icon={Users} title="No enrolled students" description="Attendance lists students enrolled in this course." />
        ) : (
          <Card>
            <div className="overflow-x-auto rounded-card">
              <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                <thead className="bg-sage-50 text-xs uppercase tracking-wide text-forest-600">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-semibold">Student</th>
                    <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                    <th scope="col" className="px-4 py-3 font-semibold">First joined</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Joins</th>
                    <th scope="col" className="px-4 py-3 text-right font-semibold">Time in class</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-sage-100">
                  {rows.map((r) => {
                    const joined = Boolean(r.firstJoinedAt);
                    const pct = joined ? Math.min(100, Math.round((r.totalSeconds / classSeconds) * 100)) : 0;
                    return (
                      <tr key={r.userId}>
                        <td className="px-4 py-3 font-medium">{r.fullName}</td>
                        <td className="px-4 py-3">
                          {r.isInRoom ? <span className="rounded-pill bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-800">In class</span>
                            : joined ? <span className="rounded-pill bg-sage-100 px-2 py-0.5 text-xs font-semibold text-forest-800">Attended</span>
                            : <span className="rounded-pill bg-danger-50 px-2 py-0.5 text-xs font-semibold text-danger-700">Absent</span>}
                        </td>
                        <td className="px-4 py-3 text-forest-600">{r.firstJoinedAt ? formatWhen(r.firstJoinedAt) : "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{r.joinCount}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{joined ? `${formatDuration(r.totalSeconds)} (${pct}%)` : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
      <p className="mt-3 text-xs text-forest-600">Time in class is exact when LiveKit webhooks are connected; otherwise it counts from join to leave in the app.</p>
    </DashboardShell>
  );
}
