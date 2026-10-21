import { Skeleton } from "@/components/ui/skeleton";

/** Shown while any student dashboard page is loading its data. */
export default function StudentLoading() {
  return (
    <div className="min-h-screen bg-sand-50 lg:pl-64" role="status" aria-label="Loading">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-80" />
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-40 lg:col-span-2" />
          <Skeleton className="h-40" />
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
        <span className="sr-only">Loading…</span>
      </div>
    </div>
  );
}
