import { PageShell } from "@/components/layout/page-shell";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <PageShell>
      <div className="container-page py-24 text-center">
        <p className="text-sm font-semibold text-brand-700">404</p>
        <h1 className="mt-2 text-3xl font-extrabold">This page could not be found</h1>
        <p className="mt-2 text-forest-600">The page may have moved or never existed.</p>
        <ButtonLink href="/" className="mt-6">
          Back to home
        </ButtonLink>
      </div>
    </PageShell>
  );
}
