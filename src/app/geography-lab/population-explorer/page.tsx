import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PopulationExplorer } from "@/components/geography-lab/population-explorer";

export const metadata: Metadata = { title: "Population Data Explorer" };

export default function PopulationExplorerPage() {
  return (
    <PageShell>
      <div className="container-page py-8 sm:py-10">
        <Link href="/geography-lab" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Geography Lab
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">Population Data Explorer</h1>
        <p className="mt-2 max-w-2xl text-forest-600">Calculate population density and growth, compare settlement patterns, and interpret age structure.</p>
        <div className="mt-6"><PopulationExplorer /></div>
      </div>
    </PageShell>
  );
}
