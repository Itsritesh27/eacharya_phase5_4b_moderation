import type { Metadata } from "next";
import Link from "next/link";
import { Bookmark, MonitorPlay } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { BookmarkButton } from "@/components/learning/bookmark-button";
import { ResourceIcon, RESOURCE_TYPE_INFO } from "@/components/resources/resource-icon";
import { EmptyState } from "@/components/ui/empty-state";
import { requireRole } from "@/lib/auth/session";
import { getBookmarks } from "@/lib/data/learning";

export const metadata: Metadata = { title: "Bookmarks" };
export const dynamic = "force-dynamic";

export default async function BookmarksPage() {
  const session = await requireRole("student");
  const bookmarks = await getBookmarks(session.userId, 100);

  return (
    <DashboardShell session={session}>
      <h1 className="text-2xl font-extrabold sm:text-3xl">Bookmarks</h1>
      <p className="mt-1 text-forest-600">Lessons and resources you saved for later.</p>

      <div className="mt-8">
        {bookmarks.length === 0 ? (
          <EmptyState
            icon={Bookmark}
            title="No bookmarks yet"
            description="Use the bookmark button on a lesson or resource to save it here."
          />
        ) : (
          <ul className="divide-y divide-sage-100 rounded-card border border-sage-200 bg-white shadow-card">
            {bookmarks.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                {b.lesson ? (
                  <Link href={`/tutorials/${b.lesson.lessonId}`} className="flex min-w-0 items-center gap-3 hover:text-brand-700">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                      <MonitorPlay className="h-4 w-4" aria-hidden />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{b.lesson.lessonTitle}</span>
                      <span className="block truncate text-xs text-forest-500">
                        Lesson · {b.lesson.courseTitle} · {b.lesson.unitTitle}
                      </span>
                    </span>
                  </Link>
                ) : b.resource ? (
                  <Link href={`/resources/${b.resource.id}`} className="flex min-w-0 items-center gap-3 hover:text-brand-700">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand-700">
                      <ResourceIcon type={b.resource.type} className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{b.resource.title}</span>
                      <span className="block text-xs text-forest-500">
                        Resource · {RESOURCE_TYPE_INFO[b.resource.type].label}
                      </span>
                    </span>
                  </Link>
                ) : null}
                <BookmarkButton
                  lessonId={b.lesson?.lessonId}
                  resourceId={b.lesson ? undefined : b.resource?.id}
                  initial
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </DashboardShell>
  );
}
