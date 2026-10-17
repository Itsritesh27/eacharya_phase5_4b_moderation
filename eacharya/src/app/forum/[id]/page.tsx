import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, MessageCircle } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { AuthorLine } from "@/components/forum/author-line";
import { DiscussionBookmarkButton } from "@/components/forum/discussion-bookmark-button";
import { DiscussionOwnerTools } from "@/components/forum/discussion-owner-tools";
import { LikeButton } from "@/components/forum/like-button";
import { ReportButton } from "@/components/forum/report-button";
import { ReplyForm } from "@/components/forum/reply-form";
import { ReplyItem } from "@/components/forum/reply-item";
import { Alert } from "@/components/ui/alert";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/auth/session";
import { categoryLabel } from "@/lib/forum/categories";
import { getAuthorCards, getDiscussion, getMyDiscussionStates, getMyReplyLikes, getMyReportedIds, listReplies, REPLY_LIMIT } from "@/lib/forum/data";
import { formatDate, formatDateTime, wasEdited } from "@/lib/forum/format";
import { idSchema } from "@/lib/forum/validation";
import { validateExternalUrl } from "@/lib/learning/external-url";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Discussion" };
export const dynamic = "force-dynamic";

export default async function DiscussionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const session = await requireSession(`/forum/${id}`);
  const supabase = await createClient();

  const found = await getDiscussion(supabase, id);
  if (found.status === "error") throw new Error("Could not load the discussion."); // shows forum/error.tsx
  if (found.status === "unavailable") {
    return (
      <DashboardShell session={session}>
        <Alert tone="error">The forum is not set up in the database yet, so this discussion cannot be shown.</Alert>
      </DashboardShell>
    );
  }
  const discussion = found.data;
  if (!discussion) notFound(); // missing, or hidden from this user by RLS

  const replies = await listReplies(supabase, id);
  if (replies.status === "error") throw new Error("Could not load the replies.");
  const replyList = replies.status === "ok" ? replies.data : { items: [], total: 0 };

  const [mine, myReplyLikes, reportedDiscussions, reportedReplies] = await Promise.all([
    getMyDiscussionStates(supabase, [discussion.id]),
    getMyReplyLikes(supabase, replyList.items.map((r) => r.id)),
    getMyReportedIds(supabase, "discussion", [discussion.id]),
    getMyReportedIds(supabase, "reply", replyList.items.map((r) => r.id)),
  ]);
  const authors = await getAuthorCards(supabase, [discussion.authorId, ...replyList.items.map((r) => r.authorId)]);
  const isOwner = discussion.authorId === session.userId;
  const safeLinks = discussion.links
    .map((l) => validateExternalUrl(l))
    .filter((l): l is NonNullable<typeof l> => l !== null && l.href.startsWith("https://"));

  return (
    <DashboardShell session={session}>
      <Link href="/forum" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700 hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Back to the forum
      </Link>

      <article className="mt-4 max-w-3xl" aria-labelledby="discussion-title">
        {discussion.isHidden && <div className="mb-3"><Alert tone="error">This discussion is hidden from other users.</Alert></div>}
        <Card>
          <CardBody>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
              <span className="rounded-full bg-sage-100 px-2 py-0.5 text-forest-800">Class {discussion.grade}</span>
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-brand-800">{categoryLabel(discussion.category)}</span>
            </div>
            <h1 id="discussion-title" className="mt-3 break-words text-2xl font-extrabold sm:text-3xl">{discussion.title}</h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-forest-600">
              <AuthorLine author={authors.get(discussion.authorId)} />
              <time dateTime={discussion.createdAt}>{formatDateTime(discussion.createdAt)}</time>
              {wasEdited(discussion.createdAt, discussion.updatedAt) && <span>· edited {formatDate(discussion.updatedAt)}</span>}
            </p>
            <p className="mt-5 whitespace-pre-wrap break-words text-forest-900">{discussion.body}</p>
            <div className="mt-5 flex flex-wrap items-start gap-2">
              <LikeButton kind="discussion" id={discussion.id} initialCount={discussion.likeCount} initialLiked={mine.liked.has(discussion.id)} />
              <DiscussionBookmarkButton discussionId={discussion.id} initial={mine.bookmarked.has(discussion.id)} showLabel />
              {!isOwner && !discussion.isHidden && (
                <ReportButton contentType="discussion" contentId={discussion.id} initialReported={reportedDiscussions.has(discussion.id)} />
              )}
            </div>

            {safeLinks.length > 0 && (
              <div className="mt-5">
                <h2 className="text-sm font-bold text-forest-900">Supporting links</h2>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {safeLinks.map((l) => (
                    <li key={l.href}>
                      <a href={l.href} target="_blank" rel="noopener noreferrer nofollow ugc"
                        className="inline-flex items-center gap-1.5 break-all font-semibold text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                        {l.host} <ExternalLink className="h-3.5 w-3.5 shrink-0" aria-hidden />
                        <span className="sr-only">(opens in a new tab, external site)</span>
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-xs text-forest-600">Links were added by a member and are not checked by eAcharya.</p>
              </div>
            )}
          </CardBody>
        </Card>
        {isOwner && (
          <DiscussionOwnerTools
            discussion={{ id: discussion.id, title: discussion.title, body: discussion.body, links: discussion.links }}
            replyCount={replyList.total}
          />
        )}
      </article>

      <section aria-labelledby="replies-h" className="mt-8 max-w-3xl">
        <h2 id="replies-h" className="flex items-center gap-2 text-xl font-bold">
          <MessageCircle className="h-5 w-5 text-brand-700" aria-hidden /> Replies ({replyList.total})
        </h2>
        <div className="mt-3">
          {replyList.items.length === 0 ? (
            <EmptyState icon={MessageCircle} title="No replies yet" description="Be the first to help. Share what you know or ask a follow-up question." />
          ) : (
            <ol className="space-y-3">
              {replyList.items.map((r) => (
                <ReplyItem key={r.id} id={r.id} body={r.body} author={authors.get(r.authorId)}
                  dateLabel={formatDateTime(r.createdAt)} edited={wasEdited(r.createdAt, r.updatedAt)}
                  canManage={r.authorId === session.userId}
                  likeCount={r.likeCount} likedByMe={myReplyLikes.has(r.id)}
                  canReport={r.authorId !== session.userId && !discussion.isHidden} alreadyReported={reportedReplies.has(r.id)} />
              ))}
            </ol>
          )}
          {replyList.total > REPLY_LIMIT && (
            <p className="mt-3 text-sm text-forest-600">Showing the first {REPLY_LIMIT} replies.</p>
          )}
        </div>

        <Card className="mt-6">
          <CardBody>
            {discussion.isHidden ? (
              <p className="text-sm text-forest-700">Replies are closed on hidden discussions.</p>
            ) : (
              <ReplyForm discussionId={discussion.id} />
            )}
          </CardBody>
        </Card>
      </section>
    </DashboardShell>
  );
}
