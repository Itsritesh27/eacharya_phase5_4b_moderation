import { PageShell } from "@/components/layout/page-shell";
import { Hero } from "@/components/landing/hero";
import { FeatureStrip } from "@/components/landing/feature-strip";
import { ClassCards } from "@/components/landing/class-cards";
import { LearningComponents } from "@/components/landing/learning-components";
import { ButtonLink } from "@/components/ui/button";

export default function HomePage() {
  return (
    <PageShell>
      <Hero />
      <FeatureStrip />
      <ClassCards />
      <LearningComponents />
      <section className="container-page py-14 text-center sm:py-20">
        <h2 className="text-3xl font-extrabold sm:text-4xl">Start learning Geography today</h2>
        <p className="mx-auto mt-3 max-w-xl text-forest-600">
          Create a free account to follow the curriculum for your class.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <ButtonLink href="/sign-up" size="lg">
            Get Started
          </ButtonLink>
          <ButtonLink href="/courses" variant="secondary" size="lg">
            Browse Courses
          </ButtonLink>
        </div>
      </section>
    </PageShell>
  );
}
