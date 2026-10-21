import { Skeleton } from "@/components/ui/skeleton";

export default function ForumLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-10" role="status" aria-label="Loading">
      <Skeleton className="h-9 w-64" />
      <Skeleton className="h-11 w-full" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
