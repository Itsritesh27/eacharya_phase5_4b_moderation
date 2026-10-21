import Link from "next/link";
import { validateExternalUrl } from "@/lib/learning/external-url";
import { BookmarkButton } from "@/components/learning/bookmark-button";
import { RESOURCE_TYPE_INFO, ResourceIcon } from "./resource-icon";
import type { ResourceRow } from "@/types/app";

export function ResourceCard({
  resource,
  bookmarked,
  courseTitle,
}: {
  resource: ResourceRow;
  bookmarked: boolean;
  courseTitle?: string | null;
}) {
  const info = RESOURCE_TYPE_INFO[resource.resource_type];
  const host =
    resource.resource_type === "link" ? validateExternalUrl(resource.external_url)?.host ?? null : null;
  const thumb = resource.thumbnail_url?.startsWith("https://") ? resource.thumbnail_url : null;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-card border border-sage-200 bg-white shadow-card">
      <div className="flex h-28 items-center justify-center bg-sage-100">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <ResourceIcon type={resource.resource_type} className="h-10 w-10 text-brand-700" />
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-pill bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800">
            {info.label}
          </span>
          {resource.topic && (
            <span className="rounded-pill bg-sage-100 px-2.5 py-0.5 text-xs font-medium text-forest-700">
              {resource.topic}
            </span>
          )}
        </div>
        <h3 className="mt-2 text-base font-bold text-forest-950">
          <Link href={`/resources/${resource.id}`} className="hover:text-brand-700 hover:underline">
            {resource.title}
          </Link>
        </h3>
        {courseTitle && <p className="mt-0.5 text-xs text-forest-500">{courseTitle}</p>}
        {resource.description && <p className="mt-1.5 line-clamp-2 text-sm text-forest-600">{resource.description}</p>}
        {host && <p className="mt-1.5 text-xs text-forest-500">Opens {host} (external site)</p>}
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <Link href={`/resources/${resource.id}`} className="text-sm font-semibold text-brand-700 hover:underline">
            View
          </Link>
          <BookmarkButton resourceId={resource.id} initial={bookmarked} />
        </div>
      </div>
    </article>
  );
}
