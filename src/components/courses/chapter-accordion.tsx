"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, ChevronDown, FileText, Lock, PlayCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ChapterLesson {
  id: string;
  title: string;
  done: boolean;
}
export interface ChapterResource {
  id: string;
  title: string;
  typeLabel: string;
}
export interface Chapter {
  id: string;
  title: string;
  description: string;
  lessons: ChapterLesson[];
  resources: ChapterResource[];
}

function ChapterItem({ chapter, index, canOpenLessons, canOpenResources, defaultOpen }: {
  chapter: Chapter;
  index: number;
  canOpenLessons: boolean;
  canOpenResources: boolean;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [tab, setTab] = useState<"videos" | "resources">("videos");
  const panelId = `chapter-panel-${chapter.id}`;

  return (
    <li className="overflow-hidden rounded-card border border-sage-200 bg-white shadow-card">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-sage-50 sm:px-5"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700">
          {index + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold text-forest-950 sm:text-base">{chapter.title}</span>
          <span className="block text-xs text-forest-600">
            {chapter.lessons.length} video lesson{chapter.lessons.length === 1 ? "" : "s"} · {chapter.resources.length} resource
            {chapter.resources.length === 1 ? "" : "s"}
          </span>
        </span>
        <ChevronDown className={cn("h-5 w-5 shrink-0 text-forest-600 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div id={panelId} className="border-t border-sage-100 px-4 pb-4 pt-3 sm:px-5">
          {chapter.description && <p className="mb-3 text-sm text-forest-600">{chapter.description}</p>}
          <div role="tablist" aria-label={`${chapter.title} content`} className="mb-3 inline-flex rounded-xl bg-sage-100 p-1">
            {(["videos", "resources"] as const).map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={cn(
                  "rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition-colors",
                  tab === t ? "bg-white text-brand-800 shadow-card" : "text-forest-700 hover:text-brand-800",
                )}
              >
                {t} ({t === "videos" ? chapter.lessons.length : chapter.resources.length})
              </button>
            ))}
          </div>

          {tab === "videos" ? (
            chapter.lessons.length === 0 ? (
              <p className="rounded-xl bg-sage-50 px-4 py-3 text-sm text-forest-600">Video lessons coming soon. Study material is under Resources.</p>
            ) : (
              <ul className="space-y-1.5">
                {chapter.lessons.map((l) => {
                  const Icon = l.done ? CheckCircle2 : canOpenLessons ? PlayCircle : Lock;
                  const inner = (
                    <>
                      <Icon className={cn("h-5 w-5 shrink-0", l.done ? "text-brand-600" : "text-forest-500")} aria-hidden />
                      <span className="flex-1 text-sm font-medium">{l.title}</span>
                    </>
                  );
                  return (
                    <li key={l.id}>
                      {canOpenLessons ? (
                        <Link href={`/tutorials/${l.id}`} className="flex items-center gap-3 rounded-xl border border-sage-100 px-3 py-2.5 text-forest-900 hover:border-brand-300 hover:bg-brand-50/50">
                          {inner}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 rounded-xl border border-sage-100 px-3 py-2.5 text-forest-700">{inner}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )
          ) : chapter.resources.length === 0 ? (
            <p className="rounded-xl bg-sage-50 px-4 py-3 text-sm text-forest-600">No resources for this chapter yet.</p>
          ) : (
            <ul className="space-y-1.5">
              {chapter.resources.map((r) => (
                <li key={r.id}>
                  {canOpenResources ? (
                    <Link href={`/resources/${r.id}`} className="flex items-center gap-3 rounded-xl border border-sage-100 px-3 py-2.5 hover:border-brand-300 hover:bg-brand-50/50">
                      <FileText className="h-5 w-5 shrink-0 text-brand-600" aria-hidden />
                      <span className="flex-1 text-sm font-medium">{r.title}</span>
                      <span className="text-xs text-forest-500">{r.typeLabel}</span>
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 rounded-xl border border-sage-100 px-3 py-2.5 text-forest-700">
                      <Lock className="h-5 w-5 shrink-0 text-forest-500" aria-hidden />
                      <span className="flex-1 text-sm font-medium">{r.title}</span>
                      <span className="text-xs text-forest-500">Sign in</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  );
}

export function ChapterAccordion({ chapters, canOpenLessons, canOpenResources }: { chapters: Chapter[]; canOpenLessons: boolean; canOpenResources: boolean }) {
  const firstWithContent = chapters.findIndex((c) => c.lessons.length > 0);
  return (
    <ol className="space-y-3">
      {chapters.map((c, i) => (
        <ChapterItem
          key={c.id}
          chapter={c}
          index={i}
          canOpenLessons={canOpenLessons}
          canOpenResources={canOpenResources}
          defaultOpen={i === Math.max(firstWithContent, 0)}
        />
      ))}
    </ol>
  );
}
