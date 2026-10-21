import Link from "next/link";
import { SearchX, Library } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ResourceCard } from "./resource-card";
import { RESOURCE_TYPE_INFO, RESOURCE_TYPES, isResourceType } from "./resource-icon";
import {
  getBookmarkedResourceIds,
  getResourceFilterOptions,
  searchResources,
  type ResourceFilters,
} from "@/lib/data/resources";
import { parsePage, sanitizeSearch } from "@/lib/learning/search";

type RawParams = Record<string, string | string[] | undefined>;

const uuid = z.string().uuid();
const GRADES = [9, 10, 11, 12];

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function parseFilters(params: RawParams): ResourceFilters {
  const grade = Number(first(params.grade));
  const course = uuid.safeParse(first(params.course));
  const unit = uuid.safeParse(first(params.unit));
  const type = first(params.type);
  const topic = first(params.topic)?.slice(0, 80);
  return {
    q: sanitizeSearch(first(params.q)),
    grade: GRADES.includes(grade) ? grade : undefined,
    courseId: course.success ? course.data : undefined,
    unitId: course.success && unit.success ? unit.data : undefined,
    topic: topic || undefined,
    type: isResourceType(type) ? type : undefined,
    sort: first(params.sort) === "title" ? "title" : "newest",
    page: parsePage(first(params.page)),
  };
}

function href(basePath: string, f: ResourceFilters, page: number) {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.grade) p.set("grade", String(f.grade));
  if (f.courseId) p.set("course", f.courseId);
  if (f.unitId) p.set("unit", f.unitId);
  if (f.topic) p.set("topic", f.topic);
  if (f.type) p.set("type", f.type);
  if (f.sort !== "newest") p.set("sort", f.sort);
  if (page > 1) p.set("page", String(page));
  const qs = p.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}

const selectClass =
  "h-10 w-full rounded-xl border border-sage-300 bg-white px-3 text-sm text-forest-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500";

export async function ResourceLibrary({
  basePath,
  params,
  userId,
}: {
  basePath: string;
  params: RawParams;
  userId: string;
}) {
  const filters = parseFilters(params);
  const [result, options] = await Promise.all([searchResources(filters), getResourceFilterOptions(filters.courseId)]);
  const bookmarked = await getBookmarkedResourceIds(
    userId,
    result.items.map((r) => r.id),
  );

  const hasFilters = Boolean(
    filters.q || filters.grade || filters.courseId || filters.unitId || filters.topic || filters.type,
  );

  return (
    <div>
      <h1 className="text-2xl font-extrabold sm:text-3xl">e-Content Library</h1>
      <p className="mt-1 text-forest-600">Notes, PDFs, presentations, infographics and links for your Geography courses.</p>

      <form method="get" action={basePath} className="mt-6 rounded-card border border-sage-200 bg-white p-4 shadow-card">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2">
            <label htmlFor="q" className="mb-1 block text-xs font-semibold text-forest-700">
              Search title or description
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={filters.q}
              maxLength={60}
              placeholder="e.g. monsoon"
              className={selectClass}
            />
          </div>
          <div>
            <label htmlFor="grade" className="mb-1 block text-xs font-semibold text-forest-700">
              Class
            </label>
            <select id="grade" name="grade" defaultValue={filters.grade ?? ""} className={selectClass}>
              <option value="">All classes</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  Class {g}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="type" className="mb-1 block text-xs font-semibold text-forest-700">
              Type
            </label>
            <select id="type" name="type" defaultValue={filters.type ?? ""} className={selectClass}>
              <option value="">All types</option>
              {RESOURCE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {RESOURCE_TYPE_INFO[t].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="course" className="mb-1 block text-xs font-semibold text-forest-700">
              Course
            </label>
            <select id="course" name="course" defaultValue={filters.courseId ?? ""} className={selectClass}>
              <option value="">All courses</option>
              {options.courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="unit" className="mb-1 block text-xs font-semibold text-forest-700">
              Unit
            </label>
            <select
              id="unit"
              name="unit"
              defaultValue={filters.unitId ?? ""}
              disabled={!filters.courseId}
              className={selectClass}
            >
              <option value="">{filters.courseId ? "All units" : "Choose a course first"}</option>
              {options.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="topic" className="mb-1 block text-xs font-semibold text-forest-700">
              Topic
            </label>
            <select id="topic" name="topic" defaultValue={filters.topic ?? ""} className={selectClass}>
              <option value="">All topics</option>
              {options.topics.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="sort" className="mb-1 block text-xs font-semibold text-forest-700">
              Sort by
            </label>
            <select id="sort" name="sort" defaultValue={filters.sort} className={selectClass}>
              <option value="newest">Newest first</option>
              <option value="title">Title (A–Z)</option>
            </select>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button type="submit" size="sm">
            Apply filters
          </Button>
          {hasFilters && (
            <Link href={basePath} className="inline-flex h-9 items-center px-3 text-sm font-semibold text-brand-700 hover:underline">
              Clear all
            </Link>
          )}
        </div>
      </form>

      <p className="mt-6 text-sm text-forest-600" aria-live="polite">
        {result.total === 0 ? "No resources" : `${result.total} resource${result.total === 1 ? "" : "s"}`}
      </p>

      <div className="mt-3">
        {result.items.length === 0 ? (
          hasFilters ? (
            <EmptyState
              icon={SearchX}
              title="No resources match your search"
              description="Try a different word, or clear some filters."
            />
          ) : (
            <EmptyState
              icon={Library}
              title="No resources yet"
              description="Published study material will appear here as teachers add it."
            />
          )
        ) : (
          <ul className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {result.items.map((r) => (
              <li key={r.id}>
                <ResourceCard resource={r} bookmarked={bookmarked.has(r.id)} courseTitle={r.courseTitle} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {result.pageCount > 1 && (
        <nav aria-label="Pagination" className="mt-8 flex items-center justify-between">
          {result.page > 1 ? (
            <Link href={href(basePath, filters, result.page - 1)} className="text-sm font-semibold text-brand-700 hover:underline">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-sm text-forest-600">
            Page {result.page} of {result.pageCount}
          </span>
          {result.page < result.pageCount ? (
            <Link href={href(basePath, filters, result.page + 1)} className="text-sm font-semibold text-brand-700 hover:underline">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </nav>
      )}
    </div>
  );
}
