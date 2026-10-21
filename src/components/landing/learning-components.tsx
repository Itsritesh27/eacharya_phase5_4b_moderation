import { ClipboardCheck, FileText, MessagesSquare, MonitorPlay } from "lucide-react";

const COMPONENTS = [
  {
    icon: MonitorPlay,
    title: "e-Tutorial",
    text: "Guided, step-by-step lessons that explain each topic clearly.",
  },
  {
    icon: FileText,
    title: "e-Content",
    text: "Notes, maps and reference material organised by unit.",
  },
  {
    icon: MessagesSquare,
    title: "Discussion Forum",
    text: "A space to ask questions and learn together with teachers.",
  },
  {
    icon: ClipboardCheck,
    title: "Assessment",
    text: "Quizzes and practice to check understanding.",
  },
] as const;

export function LearningComponents() {
  return (
    <section aria-labelledby="how-heading" className="bg-white">
      <div className="container-page py-14 sm:py-20">
        <div className="max-w-2xl">
          <h2 id="how-heading" className="text-3xl font-extrabold sm:text-4xl">
            One platform, four ways to learn
          </h2>
          <p className="mt-3 text-forest-600">
            eAcharya is built for Geography learners and teachers in Classes 9–12. These four learning
            components are planned for the platform and will arrive in upcoming phases.
          </p>
        </div>

        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {COMPONENTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="rounded-card border border-sage-200 bg-sand-50 p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 text-lg font-bold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-forest-600">{text}</p>
              <p className="mt-3 inline-block rounded-pill bg-sage-100 px-2.5 py-0.5 text-xs font-medium text-forest-700">
                Planned
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
