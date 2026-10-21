import Link from "next/link";
import {
  ArrowRight, Clock, CloudSun, Compass, Database, Footprints, Layers, LogIn, Map, Target, Users, type LucideIcon,
} from "lucide-react";
import { GlobeIllustration } from "@/components/landing/globe-illustration";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardBody } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils/cn";
import {
  LAB_GRADES, LAB_TOOLS, formatMinutes, type LabActivity, type LabGrade, type LabToolId,
} from "@/lib/geography-lab/catalogue";
import type { Role } from "@/types/app";

const TOOL_ICONS: Record<LabToolId, LucideIcon> = {
  map: Map, latlong: Compass, thematic: Layers, climate: CloudSun, population: Users, fieldwork: Footprints, datasets: Database,
};

export function LabHero() {
  return (
    <section className="border-b border-sage-200 bg-sage-50/70">
      <div className="container-page grid items-center gap-8 py-12 sm:py-16 lg:grid-cols-2">
        <div>
          <h1 className="text-4xl font-extrabold sm:text-5xl">Geography Lab</h1>
          <p className="mt-4 max-w-xl text-lg text-forest-700">
            Learn Geography by doing: explore maps, read real data and complete practical activities for
            Classes 9 to 12.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <ButtonLink href="#activities" size="lg">
              Browse activities <ArrowRight className="h-4 w-4" aria-hidden />
            </ButtonLink>
            <ButtonLink href="#tools" variant="secondary" size="lg">See lab tools</ButtonLink>
          </div>
        </div>
        <GlobeIllustration className="mx-auto h-auto w-full max-w-xs sm:max-w-sm" />
      </div>
    </section>
  );
}

export function ToolCards() {
  return (
    <section id="tools" aria-labelledby="tools-h" className="container-page scroll-mt-20 py-12">
      <h2 id="tools-h" className="text-2xl font-extrabold sm:text-3xl">Lab tools</h2>
      <p className="mt-1 max-w-3xl text-forest-600">Explore coordinates, build thematic maps, analyse climate and population data, download India-focused project datasets, or open a practical activity. Sample data is labelled when it is illustrative rather than official statistics.</p>
      <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {LAB_TOOLS.map((tool) => {
          const Icon = TOOL_ICONS[tool.id];
          const body = (
            <>
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-sage-100 text-brand-700">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-3 font-bold text-forest-950">{tool.title}</h3>
              <p className="mt-1 text-sm text-forest-600">{tool.description}</p>
              {tool.href ? (
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand-700">
                  Open <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              ) : (
                <span className="mt-3 inline-block rounded-pill bg-sage-100 px-2.5 py-0.5 text-xs font-semibold text-forest-700">
                  Coming soon
                </span>
              )}
            </>
          );
          return (
            <li key={tool.id}>
              {tool.href ? (
                <Link href={tool.href} className="block h-full rounded-card border border-sage-200 bg-white p-5 shadow-card transition hover:shadow-lift focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
                  {body}
                </Link>
              ) : (
                <div aria-disabled="true" className="h-full rounded-card border border-dashed border-sage-300 bg-sage-50/60 p-5">
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export function ClassTabs({ selected }: { selected: LabGrade | undefined }) {
  const items: { label: string; href: string; grade?: LabGrade }[] = [
    { label: "All classes", href: "/geography-lab#activities" },
    ...LAB_GRADES.map((g) => ({ label: `Class ${g}`, href: `/geography-lab?grade=${g}#activities`, grade: g })),
  ];
  return (
    <nav aria-label="Filter activities by class" className="mt-5">
      <ul className="flex flex-wrap gap-2">
        {items.map((it) => {
          const active = it.grade === selected;
          return (
            <li key={it.label}>
              <Link
                href={it.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "inline-flex h-10 items-center rounded-xl border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500",
                  active ? "border-brand-600 bg-brand-600 text-white" : "border-sage-300 bg-white text-forest-900 hover:bg-sage-50",
                )}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export function ActivityGrid({ activities, selected }: { activities: readonly LabActivity[]; selected: LabGrade | undefined }) {
  return (
    <section id="activities" aria-labelledby="act-h" className="container-page scroll-mt-20 py-12">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h2 id="act-h" className="text-2xl font-extrabold sm:text-3xl">Learning activities</h2>
        <span className="rounded-pill bg-sage-100 px-2.5 py-0.5 text-xs font-semibold text-forest-700">Starter catalogue</span>
      </div>
      <p className="mt-1 text-forest-600">
        A starter set of illustrative practical activities. Open one to use its workspace; the full library has search and filters.{" "}
        <Link href="/geography-lab/practicals" className="font-semibold text-brand-700 hover:underline">Browse the full library</Link>.
      </p>
      <ClassTabs selected={selected} />
      {activities.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={Footprints} title="No activities for this class yet" description="Try another class or view all classes." />
        </div>
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {activities.map((a) => (
            <li key={a.id}>
              <Card className="h-full">
                <CardBody className="flex h-full flex-col">
                  <p className="text-xs font-semibold text-brand-700">Class {a.grade} · {a.topic}</p>
                  <h3 className="mt-1 font-bold text-forest-950">{a.title}</h3>
                  <p className="mt-2 flex items-start gap-2 text-sm text-forest-700">
                    <Target className="mt-0.5 h-4 w-4 shrink-0 text-forest-500" aria-hidden />
                    <span><span className="sr-only">Learning objective: </span>{a.objective}</span>
                  </p>
                  <p className="mb-4 mt-2 flex items-center gap-2 text-sm text-forest-600">
                    <Clock className="h-4 w-4 text-forest-500" aria-hidden />
                    <span><span className="sr-only">Estimated duration: </span>{formatMinutes(a.minutes)}</span>
                  </p>
                  <ButtonLink href={`/geography-lab/practicals/${a.id}`} variant="secondary" className="mt-auto self-start" aria-label={`Open activity: ${a.title}`}>
                    Open activity
                  </ButtonLink>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function ProgressPanel({ role }: { role: Role | null }) {
  return (
    <section aria-labelledby="prog-h" className="container-page pb-12">
      <h2 id="prog-h" className="text-2xl font-extrabold sm:text-3xl">
        {role === "student" ? "Your lab progress" : role ? "Teacher view" : "Track your progress"}
      </h2>
      <div className="mt-4">
        {role === null && (
          <Card><CardBody className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-forest-700">Sign in to see your progress on lab activities.</p>
            <ButtonLink href="/sign-in?next=%2Fgeography-lab" variant="secondary">
              <LogIn className="h-4 w-4" aria-hidden /> Sign in
            </ButtonLink>
          </CardBody></Card>
        )}
        {role === "student" && (
          <EmptyState
            icon={Footprints}
            title="Activity progress is kept on this device only"
            description="Practical drafts are saved in your browser and are not uploaded or tracked on the server yet, so there is no shared progress to show here. Open an activity to continue a draft. Your lesson progress is on your dashboard."
          />
        )}
        {(role === "teacher" || role === "admin") && (
          <Card><CardBody className="flex flex-wrap items-center justify-between gap-4">
            <p className="max-w-xl text-forest-700">
              Tools for assigning lab activities and reviewing student practical work are not available yet: they need the proposed database tables, which have not been approved or applied. Student drafts stay on each student&apos;s own device.
            </p>
            <ButtonLink href={`/dashboard/${role}`} variant="secondary">Go to my dashboard</ButtonLink>
          </CardBody></Card>
        )}
      </div>
    </section>
  );
}
