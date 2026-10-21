import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { LiveRoom } from "@/components/live/live-room";
import { requireSession } from "@/lib/auth/session";
import { getSession } from "@/lib/live-sessions/data";
import { idSchema } from "@/lib/live-sessions/validation";

export const metadata: Metadata = { title: "Live class" };
export const dynamic = "force-dynamic";

export default async function LiveRoomPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const session = await requireSession(`/live/${id}`);
  // Row-level security only returns classes this user may see.
  const live = await getSession(id);
  if (!live) notFound();

  const backHref = session.profile.role === "teacher" ? "/dashboard/teacher/live" : "/dashboard/student/live";

  return (
    <div className="flex h-dvh flex-col bg-forest-950 text-white">
      <header className="flex items-center gap-3 border-b border-white/10 px-4 py-2.5">
        <Link href={backHref} className="inline-flex items-center gap-1.5 text-sm text-white/80 hover:text-white">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Leave
        </Link>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-bold">{live.title}</h1>
          <p className="truncate text-xs text-white/60">{live.courseTitle}</p>
        </div>
      </header>
      <main className="min-h-0 flex-1">
        <LiveRoom sessionId={id} backHref={backHref} />
      </main>
    </div>
  );
}
