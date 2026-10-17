import type { Metadata } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { ActivityGrid, LabHero, ProgressPanel, ToolCards } from "@/components/geography-lab/sections";
import { getViewer } from "@/lib/auth/session";
import { activitiesForGrade, parseGrade } from "@/lib/geography-lab/catalogue";

export const metadata: Metadata = { title: "Geography Lab" };
export const dynamic = "force-dynamic";

export default async function GeographyLabPage({
  searchParams,
}: {
  searchParams: Promise<{ grade?: string }>;
}) {
  const { grade: gradeParam } = await searchParams;
  const grade = parseGrade(gradeParam);
  // Public page. Role only decides which panel is shown; no student data is read here.
  const viewer = await getViewer();

  return (
    <PageShell>
      <LabHero />
      <ToolCards />
      <ActivityGrid activities={activitiesForGrade(grade)} selected={grade} />
      <ProgressPanel role={viewer?.role ?? null} />
    </PageShell>
  );
}
