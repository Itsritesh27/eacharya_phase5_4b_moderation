"use client";

import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";

export default function ForumError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-12">
      <h1 className="text-2xl font-extrabold">The forum could not load</h1>
      <Alert tone="error">Something went wrong while showing the forum. Please try again.</Alert>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/dashboard" variant="secondary">Back to dashboard</ButtonLink>
      </div>
    </div>
  );
}
