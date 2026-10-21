import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageShell } from "@/components/layout/page-shell";
import { PracticalWorkspace } from "@/components/practicals/practical-workspace";
import { getViewer } from "@/lib/auth/session";
import { getPractical } from "@/lib/practicals/catalogue";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const p = getPractical(id);
  return { title: p ? p.title : "Practical activity" };
}

export default async function PracticalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const practical = getPractical(id); // lookup in a fixed list: an unknown or hostile id is simply not found
  if (!practical) notFound();
  const viewer = await getViewer();
  return (
    <PageShell>
      <div className="container-page py-8 sm:py-10">
        <PracticalWorkspace practical={practical} userId={viewer?.userId ?? null} />
      </div>
    </PageShell>
  );
}
