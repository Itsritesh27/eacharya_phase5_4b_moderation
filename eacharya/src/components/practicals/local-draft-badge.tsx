"use client";

import { useEffect, useState } from "react";
import { draftKey, parseDraft } from "@/lib/practicals/draft";
import { getPractical } from "@/lib/practicals/catalogue";
import { computeProgress } from "@/lib/practicals/progress";

/** Shows a draft kept on THIS device. It is not server progress and is labelled that way. */
export function LocalDraftBadge({ activityId, userId }: { activityId: string; userId: string | null }) {
  const [percent, setPercent] = useState<number | null>(null);
  useEffect(() => {
    try {
      const p = getPractical(activityId);
      if (!p) return;
      const d = parseDraft(window.localStorage.getItem(draftKey(activityId, userId)), p);
      setPercent(d ? computeProgress(p, d.state).percent : null);
    } catch { setPercent(null); }
  }, [activityId, userId]);
  if (percent === null) return null;
  return <span className="inline-block rounded-pill bg-sand-100 px-2.5 py-0.5 text-xs font-semibold text-forest-800">Draft on this device · {percent}%</span>;
}
