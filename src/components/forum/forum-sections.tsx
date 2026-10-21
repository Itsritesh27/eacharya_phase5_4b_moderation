import Link from "next/link";
import { Bookmark, MessageCircle, MessagesSquare, Plus, Search, Tag, X } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/forum/format";
import type { AuthorCard, DiscussionSummary, Loaded } from "@/lib/forum/types";
import { AuthorLine } from "./author-line";
import { DiscussionBookmarkButton } from "./discussion-bookmark-button";
import { LikeButton } from "./like-button";
import {
  FORUM_CATEGORIES, FORUM_GRADES, FORUM_SORTS, MAX_QUERY_LENGTH, bookmarksHref, categoryLabel, forumHref,
  type ForumCategorySlug, type ForumGrade, type ForumSort,
} from "@/lib/forum/categories";

export interface ForumFilters { q: string; grade?: ForumGrade; category?: ForumCategorySlug; sort: ForumSort }

const chip = (active: boolean) =>
  cn(
    "inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
    active ? "border-brand-600 bg-brand-600 text-white" : "border-sage-300 bg-white text-forest-900 hover:bg-sage-50",
  );

export function ForumSearch({ filters }: { filters: ForumFilters }) {
  return (
    <form method="get" action="/forum" role="search" aria-label="Search discussions" className="flex flex-col gap-3 sm:flex-row">
      {filters.grade && <input type="hidden" name="grade" value={filters.grade} />}
      {filters.category && <input type="hidden" name="category" value={filters.category} />}
      {filters.sort !== "newest" && <input type="hidden" name="sort" value={filters.sort} />}
      <div className="relative flex-1">
        <label htmlFor="forum-q" className="sr-only">Search discussions</label>
        <Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-forest-500" aria-hidden />
        <input
          id="forum-q" name="q" type="search" maxLength={MAX_QUERY_LENGTH} defaultValue={filters.q}
          placeholder="Search discussions, e.g. monsoon"
          className="h-11 w-full rounded-xl border border-sage-300 bg-white pl-10 pr-3.5 text-sm text-forest-900 placeholder:text-forest-500/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        />
      </div>
      <button type="submit" className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
        Search
      </button>
    </form>
  );
}

export function ClassFilter({ filters }: { filters: ForumFilters }) {
  return (
    <nav aria-label="Filter by class" className="mt-5">
      <ul className="flex flex-wrap gap-2">
        <li><Link href={forumHref({ q: filters.q, category: filters.category, sort: filters.sort })} aria-current={!filters.grade ? "page" : undefined} className={chip(!filters.grade)}>All classes</Link></li>
        {FORUM_GRADES.map((g) => (
          <li key={g}>
            <Link href={forumHref({ q: filters.q, category: filters.category, sort: filters.sort, grade: g })} aria-current={filters.grade === g ? "page" : undefined} className={chip(filters.grade === g)}>
              Class {g}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function CategoryFilter({ filters }: { filters: ForumFilters }) {
  return (
    <section aria-labelledby="cat-h" className="mt-8">
      <h2 id="cat-h" className="text-xl font-bold">Topic categories</h2>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FORUM_CATEGORIES.map((c) => {
          const active = filters.category === c.slug;
          return (
            <li key={c.slug}>
              <Link
                href={forumHref({ q: filters.q, grade: filters.grade, sort: filters.sort, category: active ? undefined : c.slug })}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "block h-full rounded-card border bg-white p-4 shadow-card transition hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  active ? "border-brand-600 ring-1 ring-brand-600" : "border-sage-200",
                )}
              >
                <span className="flex items-center gap-2 font-bold text-forest-950"><Tag className="h-4 w-4 text-brand-700" aria-hidden /> {c.label}</span>
                <span className="mt-1 block text-sm text-forest-600">{c.blurb}</span>
                {active && <span className="mt-2 block text-xs font-semibold text-brand-700">Selected. Select again to clear.</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function NewDiscussionButton() {
  return (
    <ButtonLink href="/forum/new"><Plus className="h-4 w-4" aria-hidden /> Start a discussion</ButtonLink>
  );
}

export function BookmarksLink() {
  return (
    <ButtonLink href={bookmarksHref()} variant="secondary"><Bookmark className="h-4 w-4" aria-hidden /> My bookmarks</ButtonLink>
  );
}

/** Sort links keep every other filter and always go back to page 1. */
export function SortControl({ filters }: { filters: ForumFilters }) {
  return (
    <nav aria-label="Sort discussions" className="mt-4 flex flex-wrap items-center gap-2">
      <span className="text-sm font-semibold text-forest-700">Sort by</span>
      <ul className="flex flex-wrap gap-2">
        {FORUM_SORTS.map((s) => (
          <li key={s.value}>
            <Link
              href={forumHref({ q: filters.q, grade: filters.grade, category: filters.category, sort: s.value })}
              aria-current={filters.sort === s.value ? "true" : undefined}
              className={chip(filters.sort === s.value)}
            >
              {s.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Shown only while something is applied. Goes to plain /forum, which resets search, class, topic, sort and page. */
export function ClearFilters({ filters }: { filters: ForumFilters }) {
  const active = Boolean(filters.q || filters.grade || filters.category || filters.sort !== "newest");
  if (!active) return null;
  return (
    <div className="mt-4">
      <Link href="/forum" className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-sage-300 bg-white px-4 text-sm font-semibold text-forest-900 hover:bg-sage-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
        <X className="h-4 w-4" aria-hidden /> Clear all filters
      </Link>
    </div>
  );
}

export interface DiscussionPage {
  items: DiscussionSummary[]; total: number; page: number; pageSize: number;
}

/** Recent discussions, read from the database. Nothing here is invented: no rows means an honest empty state. */
export function RecentDiscussions({
  filters, result, authors,
}: {
  filters: ForumFilters & { page: number };
  result: Loaded<DiscussionPage>;
  authors: Map<string, AuthorCard>;
}) {
  const filtered = Boolean(filters.q || filters.grade || filters.category);
  const sorted = filters.sort === "liked";
  return (
    <section aria-labelledby="recent-h" className="mt-10">
      <h2 id="recent-h" className="text-xl font-bold">{filtered ? "Matching discussions" : sorted ? "Most liked discussions" : "Recent discussions"}</h2>
      <div className="mt-3">
        {result.status === "unavailable" && (
          <Alert tone="error">The forum is not set up in the database yet, so discussions cannot be shown. Please try again later.</Alert>
        )}
        {result.status === "error" && (
          <Alert tone="error">Discussions could not be loaded right now. Refresh the page to try again.</Alert>
        )}
        {result.status === "ok" && result.data.items.length === 0 && (
          <EmptyState
            icon={MessagesSquare}
            title={filtered ? "No discussions match these filters" : "No discussions yet"}
            description={
              filtered
                ? "Try a different search, class or topic, or clear the filters."
                : "Be the first to ask a Geography question. Students and teachers will be able to reply."
            }
          />
        )}
        {result.status === "ok" && result.data.items.length > 0 && (
          <>
            <p className="sr-only" role="status">{result.data.total} discussions found</p>
            <ul className="space-y-3">
              {result.data.items.map((d) => (
                <li key={d.id} className="relative rounded-card border border-sage-200 bg-white p-4 shadow-card transition focus-within:shadow-lift hover:shadow-lift sm:p-5">
                  <span className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-sage-100 px-2 py-0.5 text-forest-800">Class {d.grade}</span>
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-800">{categoryLabel(d.category)}</span>
                  </span>
                  {/* Stretched link: the whole card opens the discussion, while the buttons below stay separate controls. */}
                  <Link href={`/forum/${d.id}`} className="mt-2 block text-lg font-bold text-forest-950 after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-brand-500 focus-visible:after:rounded-card">
                    {d.title}
                  </Link>
                  <span className="mt-1 block text-sm text-forest-700">{d.excerpt}</span>
                  <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-forest-600">
                    <AuthorLine author={authors.get(d.authorId)} />
                    <span>{formatDate(d.createdAt)}</span>
                    <span className="inline-flex items-center gap-1"><MessageCircle className="h-4 w-4" aria-hidden /> {d.replyCount} {d.replyCount === 1 ? "reply" : "replies"}</span>
                  </span>
                  <span className="relative z-10 mt-3 flex flex-wrap items-start gap-2">
                    <LikeButton kind="discussion" id={d.id} initialCount={d.likeCount} initialLiked={d.likedByMe} />
                    <DiscussionBookmarkButton discussionId={d.id} initial={d.bookmarkedByMe} showLabel />
                  </span>
                </li>
              ))}
            </ul>
            <Pagination filters={filters} total={result.data.total} pageSize={result.data.pageSize} />
          </>
        )}
      </div>
    </section>
  );
}

function Pagination({ filters, total, pageSize }: { filters: ForumFilters & { page: number }; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const base = { q: filters.q, grade: filters.grade, category: filters.category, sort: filters.sort };
  return (
    <nav aria-label="Discussion pages" className="mt-5 flex items-center justify-between gap-3 text-sm">
      {filters.page > 1 ? <Link href={forumHref({ ...base, page: filters.page - 1 })} rel="prev" className={chip(false)}>Previous</Link> : <span />}
      <span className="text-forest-700">Page {filters.page} of {pages}</span>
      {filters.page < pages ? <Link href={forumHref({ ...base, page: filters.page + 1 })} rel="next" className={chip(false)}>Next</Link> : <span />}
    </nav>
  );
}
