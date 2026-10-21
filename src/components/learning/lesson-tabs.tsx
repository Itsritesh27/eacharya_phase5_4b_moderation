"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils/cn";

type TabKey = "transcript" | "notes" | "resources";

/** Accessible tab set. Panels are rendered on the server and passed in as nodes. */
export function LessonTabs({
  transcript,
  notes,
  resources,
}: {
  transcript: React.ReactNode;
  notes: React.ReactNode;
  resources: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("transcript");
  const base = useId();

  const tabs: { key: TabKey; label: string; panel: React.ReactNode }[] = [
    { key: "transcript", label: "Study notes / transcript", panel: transcript },
    { key: "notes", label: "Notes", panel: notes },
    { key: "resources", label: "Resources", panel: resources },
  ];

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const next = (index + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    const target = tabs[next];
    if (!target) return;
    setActive(target.key);
    document.getElementById(`${base}-tab-${target.key}`)?.focus();
  }

  return (
    <div>
      <div role="tablist" aria-label="Lesson material" className="flex gap-1 border-b border-sage-200">
        {tabs.map((t, i) => (
          <button
            key={t.key}
            id={`${base}-tab-${t.key}`}
            role="tab"
            type="button"
            aria-selected={active === t.key}
            aria-controls={`${base}-panel-${t.key}`}
            tabIndex={active === t.key ? 0 : -1}
            onClick={() => setActive(t.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              "-mb-px border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors",
              active === t.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-forest-600 hover:text-forest-900",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.key}
          id={`${base}-panel-${t.key}`}
          role="tabpanel"
          aria-labelledby={`${base}-tab-${t.key}`}
          hidden={active !== t.key}
          className="pt-5"
        >
          {t.panel}
        </div>
      ))}
    </div>
  );
}
