import Link from "next/link";
import { Clock, Pencil, Eye, Rocket } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import type { AssessmentListItem } from "@/lib/assessments/types";
import { StatusBadge } from "./status-badge";

const BASE = "/dashboard/teacher/assessments";

const dateFmt = new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" });

export function AssessmentList({ items }: { items: AssessmentListItem[] }) {
  return (
    <ul className="space-y-3" aria-label="Your assessments">
      {items.map((a) => {
        const draft = a.status === "draft";
        return (
          <li key={a.id} className="rounded-card border border-sage-200 bg-white p-4 shadow-card sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h3 className="truncate text-base font-bold">
                    <Link href={`${BASE}/${a.id}`} className="hover:underline">
                      {a.title}
                    </Link>
                  </h3>
                  <StatusBadge status={a.status} closesAt={a.closesAt} />
                </div>
                <p className="mt-1 text-sm text-forest-600">
                  {a.grade ? `Class ${a.grade} · ` : ""}
                  {a.courseTitle}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {draft ? (
                  <>
                    <Link href={`${BASE}/${a.id}`} className={buttonClasses("secondary", "sm")}>
                      <Pencil className="h-4 w-4" aria-hidden /> Edit
                    </Link>
                    <Link href={`${BASE}/${a.id}?tab=preview`} className={buttonClasses("secondary", "sm")}>
                      <Eye className="h-4 w-4" aria-hidden /> Preview
                    </Link>
                    <Link href={`${BASE}/${a.id}?publish=1`} className={buttonClasses("primary", "sm")}>
                      <Rocket className="h-4 w-4" aria-hidden /> Publish
                    </Link>
                  </>
                ) : (
                  <>
                    <Link href={`${BASE}/${a.id}`} className={buttonClasses("secondary", "sm")}>
                      View
                    </Link>
                    <Link href={`${BASE}/${a.id}?tab=preview`} className={buttonClasses("secondary", "sm")}>
                      <Eye className="h-4 w-4" aria-hidden /> Preview
                    </Link>
                  </>
                )}
              </div>
            </div>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm text-forest-700">
              <div className="flex gap-1.5">
                <dt className="text-forest-600">Questions</dt>
                <dd className="font-semibold">{a.questionCount}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-forest-600">Total marks</dt>
                <dd className="font-semibold">{a.questionCount === 0 ? "—" : a.totalMarks}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="sr-only">Duration</dt>
                <Clock className="h-3.5 w-3.5 text-forest-500" aria-hidden />
                <dd className="font-semibold">{a.durationMinutes ? `${a.durationMinutes} min` : "No time limit"}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="text-forest-600">Updated</dt>
                <dd className="font-semibold">{dateFmt.format(new Date(a.updatedAt))}</dd>
              </div>
            </dl>
          </li>
        );
      })}
    </ul>
  );
}
