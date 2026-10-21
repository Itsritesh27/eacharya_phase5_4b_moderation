import { ArrowRight } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { Hero } from "@/components/landing/hero";
import { FeatureStrip } from "@/components/landing/feature-strip";
import { ClassCards } from "@/components/landing/class-cards";
import { ButtonLink } from "@/components/ui/button";

export default function HomePage() {
  return (
    <PageShell>
      <Hero />
      <FeatureStrip />
      <ClassCards />
      <section className="container-page pb-14 sm:pb-20">
        <div className="relative overflow-hidden rounded-card bg-brand-700 px-6 py-8 text-white shadow-lift sm:flex sm:items-center sm:justify-between sm:gap-6 sm:px-10">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-10 [background:repeating-radial-gradient(circle_at_85%_120%,transparent_0,transparent_14px,#fff_15px,transparent_16px)]"
          />
          <div className="relative">
            <h2 className="text-xl font-extrabold text-white sm:text-2xl">Start Your Geography Learning Journey Today</h2>
            <p className="mt-1 text-sm text-brand-100">Explore complete courses, practice assessments, interactive maps and much more.</p>
          </div>
          <ButtonLink href="/sign-up" variant="secondary" size="lg" className="relative mt-5 shrink-0 sm:mt-0">
            Get Started <ArrowRight className="h-4 w-4" aria-hidden />
          </ButtonLink>
        </div>
      </section>
    </PageShell>
  );
}
