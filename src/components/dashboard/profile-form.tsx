"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { updateProfileNameAction } from "@/lib/learning/actions";

export function ProfileForm({ initialName }: { initialName: string }) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    startTransition(async () => {
      const result = await updateProfileNameAction({ fullName: name });
      if (result.ok) {
        setStatus({ tone: "success", text: "Your name has been updated." });
        router.refresh();
      } else {
        setStatus({ tone: "error", text: result.error });
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {status && <Alert tone={status.tone}>{status.text}</Alert>}
      <div>
        <Label htmlFor="fullName">Full name</Label>
        <Input id="fullName" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" />
      </div>
      <Button type="submit" disabled={pending || name.trim() === initialName.trim()}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
        Save changes
      </Button>
    </form>
  );
}
