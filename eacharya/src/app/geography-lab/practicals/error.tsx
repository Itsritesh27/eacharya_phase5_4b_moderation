"use client";

import { Alert } from "@/components/ui/alert";
import { Button, ButtonLink } from "@/components/ui/button";

export default function PracticalsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="container-page space-y-4 py-12">
      <h1 className="text-2xl font-extrabold">Something went wrong</h1>
      <Alert tone="error">The practical activities could not be shown. Your device drafts are not affected.</Alert>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href="/geography-lab" variant="secondary">Back to Geography Lab</ButtonLink>
      </div>
    </div>
  );
}
