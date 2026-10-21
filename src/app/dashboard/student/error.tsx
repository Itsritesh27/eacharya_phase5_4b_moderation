"use client";

import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function StudentError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-sand-50 px-4 text-center">
      <AlertTriangle className="h-10 w-10 text-forest-500" aria-hidden />
      <h1 className="mt-4 text-2xl font-extrabold">Something went wrong</h1>
      <p className="mt-2 max-w-md text-forest-600">
        We couldn&apos;t load this page. Your progress is safe. Please try again.
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Link href="/" className="inline-flex h-11 items-center rounded-xl border border-sage-300 bg-white px-5 text-sm font-semibold">
          Go home
        </Link>
      </div>
    </div>
  );
}
