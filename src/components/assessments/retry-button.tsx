"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Re-runs the server render of the page (which re-asks the server for the paper). Holds no question data. */
export function RetryButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={() => startTransition(() => router.refresh())}>
      <RotateCw className={pending ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden />
      {pending ? "Trying again…" : "Try again"}
    </Button>
  );
}
