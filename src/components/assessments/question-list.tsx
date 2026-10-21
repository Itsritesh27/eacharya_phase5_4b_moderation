"use client";

import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { EditorQuestion } from "@/lib/assessments/types";
import { QUESTION_TYPE_LABEL, QUESTION_TYPES } from "@/lib/assessments/validation";
import { cn } from "@/lib/utils/cn";
import type { QuestionType } from "@/types/app";

interface Props {
  questions: EditorQuestion[];
  selectedId: string | null;
  locked: boolean;
  busy: boolean;
  onSelect: (id: string) => void;
  onMove: (index: number, delta: -1 | 1) => void;
  onDelete: (q: EditorQuestion) => void;
  onAdd: (type: QuestionType) => void;
}

export function QuestionList({ questions, selectedId, locked, busy, onSelect, onMove, onDelete, onAdd }: Props) {
  return (
    <div className="space-y-4">
      {questions.length > 0 && (
        <ol className="space-y-2" aria-label="Questions in order">
          {questions.map((q, i) => (
            <li
              key={q.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border bg-white p-3.5",
                q.id === selectedId ? "border-brand-500 ring-1 ring-brand-500" : "border-sage-200",
              )}
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sage-100 text-xs font-bold text-forest-800">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium">{q.text}</p>
                <p className="mt-1 text-xs text-forest-600">
                  {QUESTION_TYPE_LABEL[q.type]} · {q.marks} {q.marks === 1 ? "mark" : "marks"}
                </p>
              </div>
              {!locked && (
                <div className="flex shrink-0 items-center gap-0.5">
                  <Button variant="ghost" size="sm" aria-label={`Move question ${i + 1} up`} disabled={busy || i === 0} onClick={() => onMove(i, -1)}>
                    <ArrowUp className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={`Move question ${i + 1} down`} disabled={busy || i === questions.length - 1} onClick={() => onMove(i, 1)}>
                    <ArrowDown className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={`Edit question ${i + 1}`} disabled={busy} onClick={() => onSelect(q.id)}>
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button variant="ghost" size="sm" aria-label={`Delete question ${i + 1}`} disabled={busy} onClick={() => onDelete(q)}>
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {!locked && (
        <div>
          <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-forest-800">
            <Plus className="h-4 w-4" aria-hidden /> Add a question
          </p>
          <div className="flex flex-wrap gap-2">
            {QUESTION_TYPES.map((t) => (
              <Button key={t} variant="secondary" size="sm" disabled={busy} onClick={() => onAdd(t)}>
                {QUESTION_TYPE_LABEL[t]}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
