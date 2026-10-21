import { Skeleton } from "@/components/ui/skeleton";

export default function GeographyLabLoading() {
  return (
    <div className="container-page space-y-6 py-12" role="status" aria-label="Loading">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-5 w-96 max-w-full" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
