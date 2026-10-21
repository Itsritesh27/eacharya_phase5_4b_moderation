import { Skeleton } from "@/components/ui/skeleton";

export default function PracticalsLoading() {
  return (
    <div className="container-page space-y-6 py-10" role="status" aria-label="Loading">
      <Skeleton className="h-10 w-80 max-w-full" />
      <Skeleton className="h-24 w-full" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-72" />)}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
