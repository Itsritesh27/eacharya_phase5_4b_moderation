import Link from "next/link";
import { Clock, Footprints, Package, Search, Target } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PRACTICALS, topicsList, type LibraryFilters } from "@/lib/practicals/catalogue";
import { DIFFICULTIES, PRACTICAL_GRADES, type Practical } from "@/lib/practicals/types";
import { LocalDraftBadge } from "./local-draft-badge";

const select = "h-11 w-full rounded-xl border border-sage-300 bg-white px-3 text-sm text-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

export function PracticalFilters({ filters }: { filters: LibraryFilters }) {
  return (
    <form method="get" action="/geography-lab/practicals" role="search" aria-label="Filter practical activities" className="mt-6 grid gap-4 rounded-card border border-sage-200 bg-white p-5 shadow-card sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <div className="sm:col-span-2 lg:col-span-1">
        <label htmlFor="q" className="mb-1.5 block text-sm font-medium text-forest-800">Search</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-forest-500" aria-hidden />
          <input id="q" name="q" type="search" maxLength={80} defaultValue={filters.q ?? ""} placeholder="e.g. rainfall" className={`${select} pl-9`} />
        </div>
      </div>
      <div>
        <label htmlFor="grade" className="mb-1.5 block text-sm font-medium text-forest-800">Class</label>
        <select id="grade" name="grade" defaultValue={filters.grade ?? ""} className={select}>
          <option value="">All classes</option>
          {PRACTICAL_GRADES.map((g) => <option key={g} value={g}>Class {g}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="topic" className="mb-1.5 block text-sm font-medium text-forest-800">Topic</label>
        <select id="topic" name="topic" defaultValue={filters.topic ?? ""} className={select}>
          <option value="">All topics</option>
          {topicsList().map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div>
        <label htmlFor="difficulty" className="mb-1.5 block text-sm font-medium text-forest-800">Difficulty</label>
        <select id="difficulty" name="difficulty" defaultValue={filters.difficulty ?? ""} className={select}>
          <option value="">Any difficulty</option>
          {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-1">
        <button type="submit" className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2">Apply</button>
        <Link href="/geography-lab/practicals" className="inline-flex h-11 items-center justify-center rounded-xl border border-sage-300 bg-white px-4 text-sm font-semibold text-forest-900 hover:bg-sage-50">Clear</Link>
      </div>
    </form>
  );
}

export function PracticalGrid({ items, userId }: { items: readonly Practical[]; userId: string | null }) {
  if (items.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState icon={Footprints} title="No activities match" description={`Nothing matches those filters among the ${PRACTICALS.length} starter activities. Try clearing a filter.`} />
      </div>
    );
  }
  return (
    <ul className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label={`${items.length} practical activities`}>
      {items.map((a) => (
        <li key={a.id}>
          <Card className="h-full">
            <CardBody className="flex h-full flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                <span className="rounded-pill bg-brand-50 px-2.5 py-0.5 text-brand-700">Class {a.grade}</span>
                <span className="rounded-pill bg-sage-100 px-2.5 py-0.5 text-forest-700">{a.difficulty}</span>
                <span className="text-forest-600">{a.topic}</span>
              </div>
              <h2 className="text-lg font-bold text-forest-950">{a.title}</h2>
              <p className="text-sm text-forest-700">{a.summary}</p>
              <div>
                <p className="flex items-center gap-1.5 text-sm font-semibold text-forest-900"><Target className="h-4 w-4 text-forest-500" aria-hidden /> Learning objectives</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-9 text-sm text-forest-700">{a.objectives.map((o) => <li key={o}>{o}</li>)}</ul>
              </div>
              <p className="flex items-start gap-1.5 text-sm text-forest-700"><Package className="mt-0.5 h-4 w-4 shrink-0 text-forest-500" aria-hidden /><span><span className="font-semibold text-forest-900">Materials: </span>{a.materials.join("; ")}</span></p>
              <p className="flex items-center gap-1.5 text-sm text-forest-600"><Clock className="h-4 w-4 text-forest-500" aria-hidden /> About {a.minutes} minutes</p>
              <div className="mt-auto flex flex-wrap items-center gap-3 pt-1">
                <ButtonLink href={`/geography-lab/practicals/${a.id}`} aria-label={`Open activity: ${a.title}`}>Open activity</ButtonLink>
                <LocalDraftBadge activityId={a.id} userId={userId} />
              </div>
            </CardBody>
          </Card>
        </li>
      ))}
    </ul>
  );
}
