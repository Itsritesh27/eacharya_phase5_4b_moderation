"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function GeographyLabError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 text-center">
      <AlertTriangle className="h-10 w-10 text-forest-500" aria-hidden />
      <h1 className="mt-4 text-2xl font-extrabold">Geography Lab could not load</h1>
      <p className="mt-2 max-w-md text-forest-600">Please try again. If it keeps happening, come back in a little while.</p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className="inline-flex h-11 items-center rounded-xl border border-sage-300 bg-white px-5 text-sm font-semibold">Go home</Link>
      </div>
    </div>
  );
}
