import Link from "next/link";
import { CalendarClock, Clock, Radio } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { joinState, type JoinState } from "@/lib/live-sessions/rules";
import type { LiveSession } from "@/lib/live-sessions/types";
import { SessionActions } from "./session-actions";

const IST = "Asia/Kolkata";
export function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: IST }).format(new Date(iso)) + " IST";
}

const BADGE: Record<JoinState, { text: string; cls: string }> = {
  upcoming: { text: "Upcoming", cls: "bg-sage-100 text-forest-800" },
  open: { text: "Starting soon", cls: "bg-amber-100 text-amber-800" },
  live: { text: "Live now", cls: "bg-brand-100 text-brand-800" },
  over: { text: "Ended", cls: "bg-sage-100 text-forest-600" },
  cancelled: { text: "Cancelled", cls: "bg-danger-50 text-danger-700" },
};

export function SessionCard({ session, role }: { session: LiveSession; role: "teacher" | "student" }) {
  const state = joinState(session);
  const badge = BADGE[state];
  const canEnter = state === "open" || state === "live";
  const teacher = role === "teacher";
  const hostCanOpen = teacher && (session.status === "scheduled" || session.status === "live");

  return (
    <li className="rounded-card border border-sage-200 bg-white p-4 shadow-card sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-xs font-semibold ${badge.cls}`}>
              {state === "live" && <Radio className="h-3 w-3" aria-hidden />}{badge.text}
            </span>
            <span className="text-xs font-semibold text-brand-700">{session.courseTitle}</span>
          </div>
          <p className="mt-1.5 text-base font-bold leading-snug">{session.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-forest-600">
            <span className="inline-flex items-center gap-1.5"><CalendarClock className="h-4 w-4" aria-hidden />{formatWhen(session.startsAt)}</span>
            <span className="inline-flex items-center gap-1.5"><Clock className="h-4 w-4" aria-hidden />{session.durationMinutes} min</span>
          </p>
          {session.description && <p className="mt-2 line-clamp-2 text-sm text-forest-600">{session.description}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {teacher ? (
            <>
              {hostCanOpen && (
                <Link href={`/live/${session.id}`} className={buttonClasses("primary", "sm")}>
                  {session.status === "live" ? "Rejoin class" : "Start class"}
                </Link>
              )}
              <Link href={`/dashboard/teacher/live/${session.id}`} className={buttonClasses("secondary", "sm")}>Attendance</Link>
              {hostCanOpen && <SessionActions id={session.id} status={session.status as "scheduled" | "live"} />}
            </>
          ) : canEnter ? (
            <Link href={`/live/${session.id}`} className={buttonClasses("primary", "sm")}>Join class</Link>
          ) : null}
        </div>
      </div>
    </li>
  );
}
