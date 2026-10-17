import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowLeft, Download, ExternalLink } from "lucide-react";
import { z } from "zod";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { BookmarkButton } from "@/components/learning/bookmark-button";
import { RESOURCE_TYPE_INFO, ResourceIcon } from "@/components/resources/resource-icon";
import { Alert } from "@/components/ui/alert";
import { buttonClasses } from "@/components/ui/button";
import { requireSession } from "@/lib/auth/session";
import { RESOURCE_COLUMNS } from "@/lib/data/learning";
import { validateExternalUrl } from "@/lib/learning/external-url";
import { getSignedResourceUrl } from "@/lib/learning/storage";
import { createClient } from "@/lib/supabase/server";
import type { ResourceRow } from "@/types/app";

export const metadata: Metadata = { title: "Resource" };
export const dynamic = "force-dynamic";

export default async function ResourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const session = await requireSession(`/resources/${id}`);
  const supabase = await createClient();

  // RLS: only published resources (or the owner's/admin's own) are returned.
  const { data } = await supabase
    .from("resources")
    .select(`${RESOURCE_COLUMNS}, course:courses(title, slug)`)
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();

  const { course, ...resource } = data as unknown as ResourceRow & {
    course: { title: string; slug: string } | null;
  };

  const { data: bm } = await supabase
    .from("bookmarks")
    .select("id")
    .eq("user_id", session.userId)
    .eq("resource_id", id)
    .maybeSingle();

  const info = RESOURCE_TYPE_INFO[resource.resource_type];
  const isFile = resource.resource_type === "pdf" || resource.resource_type === "presentation" || resource.resource_type === "image";

  // Short-lived signed URLs from the PRIVATE bucket, created with this user's session.
  const [viewUrl, downloadUrl] = isFile
    ? await Promise.all([
        getSignedResourceUrl(resource.storage_path),
        getSignedResourceUrl(resource.storage_path, { download: true }),
      ])
    : [null, null];

  const external = resource.resource_type === "link" ? validateExternalUrl(resource.external_url) : null;

  return (
    <DashboardShell session={session}>
      <Link
        href={session.profile.role === "student" ? "/dashboard/student/resources" : "/resources"}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        All resources
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <ResourceIcon type={resource.resource_type} className="h-6 w-6" />
          </span>
          <div>
            <p className="text-sm font-semibold text-brand-700">
              {info.label}
              {resource.topic ? ` · ${resource.topic}` : ""}
            </p>
            <h1 className="text-2xl font-extrabold sm:text-3xl">{resource.title}</h1>
            {course && (
              <p className="mt-1 text-sm text-forest-600">
                From{" "}
                <Link href={`/courses/${course.slug}`} className="font-medium text-brand-700 hover:underline">
                  {course.title}
                </Link>
              </p>
            )}
          </div>
        </div>
        <BookmarkButton resourceId={resource.id} initial={Boolean(bm)} showLabel />
      </header>

      {resource.description && <p className="mt-4 max-w-3xl text-forest-700">{resource.description}</p>}

      <div className="mt-8">
        {resource.resource_type === "notes" && (
          <article className="whitespace-pre-wrap rounded-card border border-sage-200 bg-white p-6 text-forest-800 shadow-card">
            {resource.body}
          </article>
        )}

        {resource.resource_type === "link" &&
          (external ? (
            <div className="rounded-card border border-sage-200 bg-white p-6 shadow-card">
              <p className="text-sm text-forest-700">
                This link opens an external website: <strong className="break-all">{external.host}</strong>. eAcharya is not
                responsible for its content.
              </p>
              <a
                href={external.href}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses("primary", "md", "mt-4")}
              >
                <ExternalLink className="h-4 w-4" aria-hidden />
                Open {external.host}
              </a>
            </div>
          ) : (
            <Alert tone="error">This link is not valid, so it has been disabled.</Alert>
          ))}

        {isFile && !viewUrl && (
          <div className="flex items-start gap-3 rounded-card border border-dashed border-sage-300 bg-sage-50/60 p-6">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-forest-600" aria-hidden />
            <div>
              <p className="font-semibold">This file is not available right now</p>
              <p className="mt-1 text-sm text-forest-600">
                It may have been moved or removed. Please try again later or ask your teacher.
              </p>
            </div>
          </div>
        )}

        {isFile && viewUrl && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              {resource.resource_type !== "presentation" && (
                <a href={viewUrl} target="_blank" rel="noopener noreferrer" className={buttonClasses("secondary", "md")}>
                  <ExternalLink className="h-4 w-4" aria-hidden />
                  Open in new tab
                </a>
              )}
              {downloadUrl && (
                <a href={downloadUrl} className={buttonClasses("primary", "md")}>
                  <Download className="h-4 w-4" aria-hidden />
                  Download
                </a>
              )}
            </div>

            {resource.resource_type === "pdf" && (
              <iframe
                title={`Preview of ${resource.title}`}
                src={viewUrl}
                className="h-[75vh] w-full rounded-card border border-sage-200 bg-white"
              />
            )}
            {resource.resource_type === "image" && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viewUrl}
                alt={resource.title}
                className="max-h-[75vh] w-auto max-w-full rounded-card border border-sage-200 bg-white"
              />
            )}
            {resource.resource_type === "presentation" && (
              <p className="text-sm text-forest-600">
                Presentations can&apos;t be previewed in the browser. Download the file to open it.
              </p>
            )}
            <p className="text-xs text-forest-500">Links to this file expire after a few minutes. Reload the page for a fresh one.</p>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
