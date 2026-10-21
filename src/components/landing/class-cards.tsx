import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { LandscapeArt, type LandscapeVariant } from "./landscape-art";

// Introductory labels only. Real curriculum lives in the database.
const CLASSES: { grade: 9 | 10 | 11 | 12; subtitle: string; variant: LandscapeVariant }[] = [
  { grade: 9, subtitle: "Contemporary India I", variant: "hills" },
  { grade: 10, subtitle: "Contemporary India II", variant: "farmland" },
  { grade: 11, subtitle: "Fundamentals of Physical Geography", variant: "peaks" },
  { grade: 12, subtitle: "India: People and Economy", variant: "city" },
];

export function ClassCards() {
  return (
    <section id="classes" aria-labelledby="classes-heading" className="container-page py-10 sm:py-14">
      <h2 id="classes-heading" className="text-2xl font-extrabold sm:text-3xl">
        Choose Your Class
      </h2>
      <p className="mt-2 text-forest-600">Explore NCERT Geography courses and start your learning journey.</p>

      <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {CLASSES.map(({ grade, subtitle, variant }) => (
          <li key={grade}>
            <Link
              href={`/courses?grade=${grade}`}
              className="group flex h-full flex-col overflow-hidden rounded-card border border-sage-200 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lift focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <div className="aspect-[2/1] w-full overflow-hidden">
                <LandscapeArt variant={variant} />
              </div>
              <div className="flex flex-1 items-end justify-between gap-3 p-4">
                <div>
                  <h3 className="text-lg font-bold text-forest-950">Class {grade}</h3>
                  <p className="mt-1 text-sm leading-snug text-forest-600">{subtitle}</p>
                </div>
                <ArrowRight
                  className="h-5 w-5 shrink-0 text-brand-600 transition group-hover:translate-x-0.5"
                  aria-hidden
                />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
