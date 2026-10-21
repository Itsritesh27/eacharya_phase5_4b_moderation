import { PageShell } from "./page-shell";

export function InfoPage({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children?: React.ReactNode;
}) {
  return (
    <PageShell>
      <div className="container-page max-w-3xl py-14">
        <h1 className="text-3xl font-extrabold sm:text-4xl">{title}</h1>
        {intro && <p className="mt-3 text-lg text-forest-600">{intro}</p>}
        {children && <div className="mt-8 space-y-4 leading-relaxed text-forest-800">{children}</div>}
      </div>
    </PageShell>
  );
}

export function ComingSoon({ feature, phase }: { feature: string; phase: string }) {
  return (
    <div className="rounded-card border border-dashed border-sage-300 bg-sage-50/60 p-6">
      <p className="font-semibold text-forest-900">{feature} is not available yet</p>
      <p className="mt-1 text-sm text-forest-600">
        This feature is scheduled for {phase}. The page exists so links stay stable as the platform grows.
      </p>
    </div>
  );
}
