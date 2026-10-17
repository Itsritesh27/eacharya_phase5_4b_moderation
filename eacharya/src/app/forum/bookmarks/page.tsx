import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Bookmark } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { DiscussionBookmarkButton } from "@/components/forum/discussion-bookmark-button";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/auth/session";
import { bookmarksHref, categoryLabel, parsePage } from "@/lib/forum/categories";
import { listBookmarks } from "@/lib/forum/data";
import { formatDate } from "@/lib/forum/format";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My forum bookmarks" };
export const dynamic = "force-dynamic";

/** Private list: the query has no user id in it, row-level security returns only the signed-in user's bookmarks. */
export default async function ForumBookmarksPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  const session = await requireSession("/forum/bookmarks");
  const sp = await searchParams;
  const page = parsePage(typeof sp.page === "string" ? sp.page : undefined);
  const supabase = await createClient();
  const result = await listBookmarks(supabase, page);

  return (
    <DashboardShell session={session}>
      <Link href="/forum" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to the forum
      </Link>
      <h1 className="mt-4 text-2xl font-extrabold sm:text-3xl">My bookmarks</h1>
      <p className="mt-1 text-forest-600">Discussions you saved for later. Only you can see this list.</p>

      <div className="mt-6 max-w-3xl">
        {result.status === "unavailable" && <Alert tone="error">The forum is not set up in the database yet, so bookmarks cannot be shown.</Alert>}
        {result.status === "error" && <Alert tone="error">Your bookmarks could not be loaded right now. Refresh the page to try again.</Alert>}
        {result.status === "ok" && result.data.items.length === 0 && (
          <div className="flex flex-col items-center gap-4">
            {page > 1 ? (
              <>
                <EmptyState icon={Bookmark} title="No bookmarks on this page" description="Go back to the first page of your bookmarks." />
                <ButtonLink href={bookmarksHref()} variant="secondary">First page</ButtonLink>
              </>
            ) : (
              <>
                <EmptyState icon={Bookmark} title="No bookmarks yet" description="Use the Bookmark button on a discussion to save it here." />
                <ButtonLink href="/forum">Browse discussions</ButtonLink>
              </>
            )}
          </div>
        )}
        {result.status === "ok" && result.data.items.length > 0 && (
          <>
            <p className="sr-only" role="status">{result.data.total} bookmarked discussions</p>
            <ul className="divide-y divide-sage-100 rounded-card border border-sage-200 bg-white shadow-card">
              {result.data.items.map((b) => (
                <li key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <Link href={`/forum/${b.id}`} className="min-w-0 hover:text-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    <span className="block break-words text-sm font-semibold sm:text-base">{b.title}</span>
                    <span className="mt-1 flex flex-wrap gap-x-2 text-xs text-forest-600">
                      <span>Class {b.grade}</span>
                      <span>· {categoryLabel(b.category)}</span>
                      <span>· saved {formatDate(b.bookmarkedAt)}</span>
                    </span>
                  </Link>
                  <DiscussionBookmarkButton discussionId={b.id} initial refreshOnChange />
                </li>
              ))}
            </ul>
            <BookmarkPages page={result.data.page} total={result.data.total} pageSize={result.data.pageSize} />
          </>
        )}
      </div>
    </DashboardShell>
  );
}

function BookmarkPages({ page, total, pageSize }: { page: number; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const cls = "inline-flex h-10 items-center rounded-xl border border-sage-300 bg-white px-4 text-sm font-semibold text-forest-900 hover:bg-sage-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";
  return (
    <nav aria-label="Bookmark pages" className="mt-5 flex items-center justify-between gap-3 text-sm">
      {page > 1 ? <Link href={bookmarksHref(page - 1)} rel="prev" className={cls}>Previous</Link> : <span />}
      <span className="text-forest-700">Page {page} of {pages}</span>
      {page < pages ? <Link href={bookmarksHref(page + 1)} rel="next" className={cls}>Next</Link> : <span />}
    </nav>
  );
}
