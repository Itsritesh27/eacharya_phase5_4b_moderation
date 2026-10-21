import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DiscussionForm } from "@/components/forum/discussion-form";
import { Card, CardBody } from "@/components/ui/card";
import { requireSession } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Start a discussion" };
export const dynamic = "force-dynamic";

export default async function NewDiscussionPage() {
  const session = await requireSession("/forum/new");
  return (
    <DashboardShell session={session}>
      <Link href="/forum" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to the forum
      </Link>
      <h1 className="mt-3 text-2xl font-extrabold sm:text-3xl">Start a discussion</h1>
      <p className="mt-1 max-w-2xl text-forest-600">
        Ask a clear Geography question. Choose the right class and topic so the right people see it.
      </p>
      <Card className="mt-6 max-w-3xl">
        <CardBody><DiscussionForm mode="create" /></CardBody>
      </Card>
    </DashboardShell>
  );
}
