import { PageShell } from "@/components/layout/page-shell";
import { ButtonLink } from "@/components/ui/button";

export default function DiscussionNotFound() {
  return (
    <PageShell>
      <div className="container-page py-24 text-center">
        <p className="text-sm font-semibold text-brand-700">404</p>
        <h1 className="mt-2 text-3xl font-extrabold">Discussion not found</h1>
        <p className="mx-auto mt-2 max-w-md text-forest-600">
          This discussion does not exist, was deleted, or is not available to you. Check the link or go back to the forum.
        </p>
        <ButtonLink href="/forum" className="mt-6">Back to the forum</ButtonLink>
      </div>
    </PageShell>
  );
}
