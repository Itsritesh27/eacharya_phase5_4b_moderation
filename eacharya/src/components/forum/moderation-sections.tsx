import Link from "next/link";
import { ExternalLink, EyeOff, Flag, Inbox, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/assessments/form-controls";
import { formatDateTime } from "@/lib/forum/format";
import {
  MODERATION_PATH, REPORT_STATUSES, moderationHref, statusLabel, type ReportFilters, type ReportStatus,
} from "@/lib/forum/moderation";
import type { ReportRow } from "@/lib/forum/moderation-data";
import { REPORT_REASONS, reasonLabel } from "@/lib/forum/report-reasons";
import type { Loaded } from "@/lib/forum/types";
import { cn } from "@/lib/utils/cn";
import { ReportActions } from "./report-actions";

const chip = (active: boolean) =>
  cn(
    "inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
    active ? "border-brand-600 bg-brand-600 text-white" : "border-sage-300 bg-white text-forest-900 hover:bg-sage-50",
  );

const STATUS_STYLE: Record<ReportStatus, string> = {
  pending: "bg-amber-100 text-amber-900",
  reviewed: "bg-sage-100 text-forest-800",
  dismissed: "bg-sage-100 text-forest-700",
  action_taken: "bg-brand-100 text-brand-800",
};

export function StatusCounts({ counts, filters }: { counts: Loaded<Record<ReportStatus, number>>; filters: ReportFilters }) {
  if (counts.status !== "ok") {
    return <Alert tone="error">Report counts could not be loaded.</Alert>;
  }
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Reports by status">
      {REPORT_STATUSES.map((s) => {
        const active = filters.status === s.value;
        return (
          <li key={s.value}>
            <Link
              href={moderationHref({ ...filters, status: s.value, page: 1 })}
              aria-current={active ? "true" : undefined}
              className={cn(
                "block rounded-card border bg-white p-4 shadow-card transition hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                active ? "border-brand-600 ring-1 ring-brand-600" : "border-sage-200",
              )}
            >
              <span className="block text-sm text-forest-600">{s.label}</span>
              <span className="mt-1 block text-3xl font-extrabold text-forest-950">{counts.data[s.value].toLocaleString("en-IN")}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** A plain GET form: every choice lands in the URL, and applying filters always starts again at page 1. */
export function QueueFilters({ filters }: { filters: ReportFilters }) {
  const any = filters.status !== "pending" || filters.type || filters.reason || filters.sort !== "newest";
  return (
    <form method="get" action={MODERATION_PATH} aria-label="Filter reports" className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <Field id="f-status" label="Status">
        <Select id="f-status" name="status" defaultValue={filters.status ?? "all"}>
          <option value="all">All statuses</option>
          {REPORT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </Field>
      <Field id="f-type" label="Content type">
        <Select id="f-type" name="type" defaultValue={filters.type ?? ""}>
          <option value="">Discussions and replies</option>
          <option value="discussion">Discussions</option>
          <option value="reply">Replies</option>
        </Select>
      </Field>
      <Field id="f-reason" label="Reason">
        <Select id="f-reason" name="reason" defaultValue={filters.reason ?? ""}>
          <option value="">All reasons</option>
          {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
        </Select>
      </Field>
      <Field id="f-sort" label="Sort">
        <Select id="f-sort" name="sort" defaultValue={filters.sort}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
        </Select>
      </Field>
      <div className="flex gap-2">
        <button type="submit" className="inline-flex h-11 items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">
          Apply
        </button>
        {any && <Link href={MODERATION_PATH} className={chip(false)}>Reset</Link>}
      </div>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-forest-800">{label}</label>
      {children}
    </div>
  );
}

export function ReportQueue({ result, filters }: { result: Loaded<{ items: ReportRow[]; total: number; page: number; pageSize: number }>; filters: ReportFilters }) {
  return (
    <section aria-labelledby="queue-h" className="mt-8">
      <h2 id="queue-h" className="text-xl font-bold">
        {filters.status ? `${statusLabel(filters.status)} reports` : "All reports"}
        {result.status === "ok" && <span className="ml-2 text-base font-semibold text-forest-600">({result.data.total.toLocaleString("en-IN")})</span>}
      </h2>
      <div className="mt-3">
        {result.status === "unavailable" && <Alert tone="error">Moderation is not set up in the database yet. Apply the Phase 5.4A and 5.4B migrations first.</Alert>}
        {result.status === "error" && <Alert tone="error">The reports could not be loaded right now. Refresh the page to try again.</Alert>}
        {result.status === "ok" && result.data.items.length === 0 && (
          <EmptyState
            icon={Inbox}
            title={filters.status === "pending" && !filters.type && !filters.reason ? "No pending reports" : "No reports match these filters"}
            description={filters.status === "pending" && !filters.type && !filters.reason ? "Nothing is waiting for review. New reports from members will appear here." : "Try a different status, type or reason, or reset the filters."}
          />
        )}
        {result.status === "ok" && result.data.items.length > 0 && (
          <>
            <p className="sr-only" role="status">{result.data.total} reports found</p>
            <ul className="space-y-4">{result.data.items.map((r) => <ReportCard key={r.id} report={r} />)}</ul>
            <Pagination filters={filters} total={result.data.total} pageSize={result.data.pageSize} />
          </>
        )}
      </div>
    </section>
  );
}

function ReportCard({ report: r }: { report: ReportRow }) {
  return (
    <li>
      <Card>
        <CardBody className="p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className="rounded-full bg-sage-100 px-2 py-0.5 text-forest-800">{r.contentType === "discussion" ? "Discussion" : "Reply"}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-brand-800"><Flag className="h-3 w-3" aria-hidden /> {reasonLabel(r.reason)}</span>
            <span className={cn("rounded-full px-2 py-0.5", STATUS_STYLE[r.status])}>{statusLabel(r.status)}</span>
          </div>
          <p className="mt-2 text-sm text-forest-600">
            Reported by <span className="font-semibold text-forest-900">{r.reporterName}</span> on <time dateTime={r.createdAt}>{formatDateTime(r.createdAt)}</time>
          </p>
          {r.description && (
            <blockquote className="mt-3 whitespace-pre-wrap break-words rounded-xl border-l-4 border-sage-300 bg-sage-50 px-3 py-2 text-sm text-forest-900">{r.description}</blockquote>
          )}

          <div className="mt-3 rounded-xl border border-sage-200 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-forest-600">Reported {r.contentType}</p>
            {r.content.state === "deleted" ? (
              <p className="mt-1 inline-flex items-center gap-1.5 text-forest-700"><Trash2 className="h-4 w-4" aria-hidden /> This post has been deleted, so there is nothing to open.</p>
            ) : (
              <>
                {r.content.state === "hidden" && <p className="mt-1 inline-flex items-center gap-1.5 font-semibold text-forest-800"><EyeOff className="h-4 w-4" aria-hidden /> Hidden from other members</p>}
                <p className="mt-1 break-words font-semibold text-forest-950">{r.content.title ?? r.content.excerpt}</p>
                {r.content.href && (
                  <Link href={r.content.href} className="mt-1.5 inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                    Open {r.contentType === "discussion" ? "discussion" : "the discussion at this reply"} <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                )}
              </>
            )}
          </div>

          {r.events.length > 0 && (
            <div className="mt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-forest-600">History</h3>
              <ol className="mt-1 space-y-1 text-sm text-forest-800">
                {r.events.map((e) => (
                  <li key={e.id}>
                    <span className="font-semibold">{e.moderatorName ?? "A former moderator"}</span>{" "}
                    {e.contentAction === "restored" ? "restored the content" : `marked it ${statusLabel(e.toStatus)}`}
                    {e.contentAction === "hidden" ? " and hid the content" : ""} · <time dateTime={e.createdAt}>{formatDateTime(e.createdAt)}</time>
                    {e.note && <span className="block whitespace-pre-wrap break-words text-forest-600">Note: {e.note}</span>}
                  </li>
                ))}
              </ol>
            </div>
          )}

          <ReportActions reportId={r.id} status={r.status} contentState={r.content.state} />
        </CardBody>
      </Card>
    </li>
  );
}

function Pagination({ filters, total, pageSize }: { filters: ReportFilters; total: number; pageSize: number }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Report pages" className="mt-5 flex items-center justify-between gap-3 text-sm">
      {filters.page > 1 ? <Link href={moderationHref({ ...filters, page: filters.page - 1 })} rel="prev" className={chip(false)}>Previous</Link> : <span />}
      <span className="text-forest-700">Page {filters.page} of {pages}</span>
      {filters.page < pages ? <Link href={moderationHref({ ...filters, page: filters.page + 1 })} rel="next" className={chip(false)}>Next</Link> : <span />}
    </nav>
  );
}

export function BackToAdmin() {
  return <ButtonLink href="/dashboard/admin" variant="secondary" size="sm">Back to admin dashboard</ButtonLink>;
}
