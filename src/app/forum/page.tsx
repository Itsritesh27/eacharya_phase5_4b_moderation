import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  BookmarksLink, CategoryFilter, ClassFilter, ClearFilters, ForumSearch, NewDiscussionButton, RecentDiscussions, SortControl,
} from "@/components/forum/forum-sections";
import { requireSession } from "@/lib/auth/session";
import { cleanQuery, parseForumCategory, parseForumGrade, parseForumSort, parsePage } from "@/lib/forum/categories";
import { getAuthorCards, listDiscussions } from "@/lib/forum/data";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Discussion Forum" };
export const dynamic = "force-dynamic";

type Params = { q?: string; grade?: string; category?: string; sort?: string; page?: string };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

export default async function ForumPage({ searchParams }: { searchParams: Promise<Params> }) {
  // Signed-in users only (students, teachers, admins), checked on the server.
  const session = await requireSession("/forum");
  const sp = await searchParams;
  const filters = {
    q: cleanQuery(one(sp.q)),
    grade: parseForumGrade(one(sp.grade)),
    category: parseForumCategory(one(sp.category)),
    sort: parseForumSort(one(sp.sort)),
    page: parsePage(one(sp.page)),
  };

  const supabase = await createClient();
  const result = await listDiscussions(supabase, filters);
  const authors = result.status === "ok"
    ? await getAuthorCards(supabase, result.data.items.map((d) => d.authorId))
    : new Map();

  return (
    <DashboardShell session={session}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold sm:text-3xl">Discussion Forum</h1>
          <p className="mt-1 max-w-2xl text-forest-600">
            Ask questions, share ideas and help each other with Geography in Classes 9 to 12. Students and teachers learn together here.
          </p>
        </div>
        <div className="flex flex-wrap gap-2"><BookmarksLink /><NewDiscussionButton /></div>
      </div>
      <div className="mt-6"><ForumSearch filters={filters} /></div>
      <ClassFilter filters={filters} />
      <SortControl filters={filters} />
      <ClearFilters filters={filters} />
      <CategoryFilter filters={filters} />
      <RecentDiscussions filters={filters} result={result} authors={authors} />
    </DashboardShell>
  );
}
