import { Skeleton } from "@/components/ui/skeleton";

export default function TeacherAssessmentsLoading() {
  return (
    <div className="min-h-screen bg-sand-50 lg:pl-64" role="status" aria-label="Loading">
      <div className="mx-auto max-w-6xl space-y-5 px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <span className="sr-only">Loading…</span>
      </div>
    </div>
  );
}
