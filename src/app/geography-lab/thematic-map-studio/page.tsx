import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { ThematicStudio } from "@/components/geography-lab/thematic-studio";

export const metadata: Metadata = { title: "Thematic Map Studio" };

export default function ThematicMapStudioPage() {
  return (
    <PageShell>
      <div className="container-page py-8 sm:py-10">
        <Link href="/geography-lab" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden /> Geography Lab
        </Link>
        <h1 className="mt-3 text-3xl font-extrabold sm:text-4xl">Thematic Map Studio</h1>
        <p className="mt-2 max-w-2xl text-forest-600">
          Turn a table of numbers into a map. Pick a starter dataset or import your own CSV, then shade countries by value, group values into classes, or draw proportional symbols.
        </p>
        <div className="mt-6">
          <ThematicStudio />
        </div>
      </div>
    </PageShell>
  );
}
