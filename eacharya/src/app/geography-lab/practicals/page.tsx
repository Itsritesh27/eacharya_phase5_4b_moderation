import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PracticalFilters, PracticalGrid } from "@/components/practicals/practical-library";
import { getViewer } from "@/lib/auth/session";
import {
  CATALOGUE_NOTICE, filterPracticals, parseDifficultyParam, parseGradeParam, parseTopicParam,
} from "@/lib/practicals/catalogue";

export const metadata: Metadata = { title: "Practical Activities" };
export const dynamic = "force-dynamic";

type Params = { q?: string; grade?: string; topic?: string; difficulty?: string };

export default async function PracticalLibraryPage({ searchParams }: { searchParams: Promise<Params> }) {
  const sp = await searchParams;
  const filters = {
    q: typeof sp.q === "string" ? sp.q.slice(0, 80) : undefined,
    grade: parseGradeParam(sp.grade),
    topic: parseTopicParam(sp.topic),
    difficulty: parseDifficultyParam(sp.difficulty),
  };
  const items = filterPracticals(filters);
  const viewer = await getViewer(); // only used to namespace device drafts; no student data is read

  return (
    <PageShell>
      <div className="container-page py-8 sm:py-10">
        <Link href="/geography-lab" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Geography Lab
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">Practical activities and virtual fieldwork</h1>
        <p className="mt-2 max-w-2xl text-forest-600">Hands-on geography tasks for Classes 9 to 12 with a workspace for your measurements, calculations and conclusions.</p>
        <p className="mt-4 flex max-w-3xl items-start gap-2 rounded-xl bg-sand-100 px-4 py-3 text-sm text-forest-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{CATALOGUE_NOTICE} Drafts are kept on your device only: submitting to a teacher is not available yet.</span>
        </p>
        <PracticalFilters filters={filters} />
        <PracticalGrid items={items} userId={viewer?.userId ?? null} />
      </div>
    </PageShell>
  );
}
