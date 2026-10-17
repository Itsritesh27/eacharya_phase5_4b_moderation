export function Welcome({ name, subtitle }: { name: string; subtitle: string }) {
  const first = name.trim().split(/\s+/)[0];
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-extrabold sm:text-3xl">{first ? `Welcome, ${first}` : "Welcome"}</h1>
      <p className="mt-1 text-forest-600">{subtitle}</p>
    </div>
  );
}

export function SectionHeading({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-lg font-bold">{children}</h2>
      {action}
    </div>
  );
}
