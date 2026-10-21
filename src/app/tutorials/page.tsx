import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, MonitorPlay } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { ProgressBar } from "@/components/learning/progress-bar";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/auth/session";
import { getCompletedLessonIds, getTutorialTree } from "@/lib/data/learning";

export const metadata: Metadata = { title: "e-Tutorials" };
export const dynamic = "force-dynamic";

export default async function TutorialsPage() {
  const session = await requireSession("/tutorials");
  const [groups, completed] = await Promise.all([getTutorialTree(session.userId), getCompletedLessonIds(session.userId)]);

  return (
    <DashboardShell session={session}>
      <h1 className="text-2xl font-extrabold sm:text-3xl">e-Tutorials</h1>
      <p className="mt-1 text-forest-600">
        Chapter-wise learning organised by class, course and unit, including study notes, practice activities and teacher-added videos. Enrol to access lesson content and track your progress.
      </p>

      <div className="mt-8 space-y-10">
        {groups.length === 0 ? (
          <EmptyState
            icon={MonitorPlay}
            title="No tutorials yet"
            description="Published courses and their lessons will appear here."
          />
        ) : (
          groups.map((g) => (
            <section key={g.grade} aria-labelledby={`class-${g.grade}`}>
              <h2 id={`class-${g.grade}`} className="mb-4 text-xl font-bold">
                {g.name}
              </h2>
              <ul className="space-y-4">
                {g.courses.map((c) => (
                  <li key={c.id} className="rounded-card border border-sage-200 bg-white p-5 shadow-card">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="text-lg font-bold">{c.title}</h3>
                        <Link href={`/courses/${c.slug}`} className="text-sm font-medium text-brand-700 hover:underline">
                          {c.enrolled ? "Course overview" : "View course and enrol"}
                        </Link>
                      </div>
                      {c.enrolled && <ProgressBar progress={c.progress} className="w-48" />}
                    </div>

                    {c.units.length === 0 ? (
                      <p className="mt-4 text-sm text-forest-500">No units yet.</p>
                    ) : (
                      <ol className="mt-4 space-y-3">
                        {c.units.map((u, i) => (
                          <li key={u.id}>
                            <p className="text-sm font-semibold text-forest-800">
                              Unit {i + 1}: {u.title}
                            </p>
                            {u.lessons.length === 0 ? (
                              <p className="mt-1 text-sm text-forest-500">No lessons yet.</p>
                            ) : (
                              <ul className="mt-1.5 space-y-1">
                                {u.lessons.map((l) => (
                                  <li key={l.id} className="flex items-center gap-2 text-sm">
                                    {completed.has(l.id) ? (
                                      <CheckCircle2 className="h-4 w-4 text-brand-600" aria-label="Completed" />
                                    ) : (
                                      <MonitorPlay className="h-4 w-4 text-forest-500" aria-hidden />
                                    )}
                                    {c.enrolled ? (
                                      <Link href={`/tutorials/${l.id}`} className="text-forest-800 hover:text-brand-700 hover:underline">
                                        {l.title}
                                      </Link>
                                    ) : (
                                      <span className="text-forest-600">{l.title}</span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        ))}
                      </ol>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </DashboardShell>
  );
}
