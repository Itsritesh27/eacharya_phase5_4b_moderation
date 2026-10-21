import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { IndiaGeographyDatasets } from "@/components/geography-lab/india-geography-datasets";

export const metadata: Metadata = {
  title: "India Geography Datasets | Geography Lab",
  description: "Explore and download source-attributed geography datasets for Class 9–12 projects.",
};

export default function IndiaGeographyDatasetsPage() {
  return (
    <PageShell>
      <div className="container-page py-8 sm:py-10">
        <Link href="/geography-lab" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Geography Lab
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">India Geography Datasets</h1>
        <p className="mt-2 max-w-3xl leading-7 text-forest-600">Browse datasets for Class 9–12 geography projects: climate and rainfall, literacy, sex ratio, urbanisation, agriculture, occupational structure, resources, infrastructure and cyclones. Search records, compare values and download filtered CSV files.</p>
        <div className="mt-6"><IndiaGeographyDatasets /></div>
      </div>
    </PageShell>
  );
}
