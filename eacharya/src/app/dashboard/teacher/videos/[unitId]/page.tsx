import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { SectionHeading } from "@/components/dashboard/welcome";
import { VideoAdder } from "@/components/teacher-videos/video-adder";
import { VideoList } from "@/components/teacher-videos/video-list";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { requireRole } from "@/lib/auth/session";
import { getChapterDetail } from "@/lib/teacher-videos/data";

export const metadata: Metadata = { title: "Chapter videos" };
export const dynamic = "force-dynamic";

export default async function ChapterVideosPage({ params }: { params: Promise<{ unitId: string }> }) {
  const session = await requireRole("teacher");
  const { unitId } = await params;
  if (!z.string().uuid().safeParse(unitId).success) notFound();

  const chapter = await getChapterDetail(unitId, session.userId);
  if (!chapter) notFound();

  // Teachers can add videos to their own courses whether draft or published.
  const locked = false;
  const existingKeys = chapter.videos.flatMap((v) => (v.key ? [v.key] : []));

  return (
    <DashboardShell session={session}>
      <Link href="/dashboard/teacher/videos" className="text-sm font-semibold text-brand-700 hover:underline">
        ← All chapters
      </Link>
      <h1 className="mb-1 mt-3 text-2xl font-extrabold sm:text-3xl">{chapter.title}</h1>
      <p className="mb-6 text-sm text-forest-600">{chapter.courseTitle}</p>

      {locked ? (
        <div className="mb-6 max-w-3xl">
          <Alert tone="error">
            This course is published, so its lessons are locked and videos cannot be added here. Ask an
            administrator to unpublish it first.
          </Alert>
        </div>
      ) : (
        <Card className="mb-8 max-w-3xl">
          <CardBody>
            <VideoAdder unitId={chapter.unitId} existingKeys={existingKeys} />
          </CardBody>
        </Card>
      )}

      <section aria-labelledby="in-chapter" className="max-w-3xl">
        <SectionHeading>
          <span id="in-chapter">Videos in this chapter ({chapter.videos.length})</span>
        </SectionHeading>
        <VideoList unitId={chapter.unitId} videos={chapter.videos} locked={locked} />
      </section>
    </DashboardShell>
  );
}
