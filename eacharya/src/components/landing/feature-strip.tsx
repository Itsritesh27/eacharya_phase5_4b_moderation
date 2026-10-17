import { BookOpenCheck, GraduationCap, Map, PencilRuler, Presentation } from "lucide-react";

const FEATURES = [
  { icon: GraduationCap, title: "Classes 9–12", note: "Four grade levels" },
  { icon: Map, title: "Interactive Maps", note: "Coming in a later phase" },
  { icon: BookOpenCheck, title: "Expert Content", note: "Curriculum-aligned" },
  { icon: PencilRuler, title: "Practical Learning", note: "Activities and fieldwork" },
  { icon: Presentation, title: "Teacher Tools", note: "For educators" },
] as const;

export function FeatureStrip() {
  return (
    <section aria-label="Platform highlights" className="border-y border-sage-200 bg-white">
      <ul className="container-page grid grid-cols-2 gap-x-4 gap-y-5 py-6 sm:grid-cols-3 lg:grid-cols-5">
        {FEATURES.map(({ icon: Icon, title, note }) => (
          <li key={title} className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sage-100 text-brand-700">
              <Icon className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-forest-900">{title}</p>
              <p className="text-xs text-forest-600">{note}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
