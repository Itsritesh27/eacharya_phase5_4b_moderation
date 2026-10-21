import { BookOpenCheck, ClipboardCheck, FolderOpen, MessagesSquare } from "lucide-react";

const FEATURES = [
  { icon: BookOpenCheck, title: "NCERT Aligned", note: "Complete syllabus for Classes 9–12" },
  { icon: FolderOpen, title: "Rich Learning Resources", note: "Videos, notes, maps and worksheets" },
  { icon: ClipboardCheck, title: "Practice & Assessments", note: "Chapter-wise tests and detailed feedback" },
  { icon: MessagesSquare, title: "Learning Community", note: "Discuss, ask doubts and learn together" },
] as const;

export function FeatureStrip() {
  return (
    <section aria-label="Platform highlights" className="container-page relative -mt-6 pb-4 sm:-mt-10">
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map(({ icon: Icon, title, note }) => (
          <li key={title} className="flex items-start gap-3 rounded-card border border-sage-200 bg-white/95 p-4 shadow-card backdrop-blur">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-bold text-forest-950">{title}</p>
              <p className="mt-0.5 text-xs leading-snug text-forest-600">{note}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
