import { Skeleton } from "@/components/ui/skeleton";

export default function ForumReportsLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10" role="status" aria-label="Loading reports">
      <Skeleton className="h-9 w-64" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
      <Skeleton className="h-11 w-full" />
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
      <span className="sr-only">Loading…</span>
    </div>
  );
}
