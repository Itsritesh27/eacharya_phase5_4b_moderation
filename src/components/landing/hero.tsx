import { ButtonLink } from "@/components/ui/button";
import { Earth3D } from "./earth-3d";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-sand-50 to-sage-100/60 pb-10">
      {/* Mountain silhouette, subtle landscape composition */}
      <svg
        viewBox="0 0 1200 240"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 w-full text-sage-200 sm:h-56"
        aria-hidden
      >
        <path
          fill="currentColor"
          d="M0 240V150l110-70 90 60 120-96 130 110 110-70 140 100 120-84 150 100 120-70 110 60v80Z"
        />
      </svg>

      <div className="container-page relative grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-2 lg:gap-6 lg:py-20">
        <div>
          <p className="mb-4 inline-flex items-center rounded-pill bg-brand-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-brand-800">
            NCERT-aligned · Classes 9–12
          </p>
          <h1 className="text-4xl font-extrabold leading-[1.05] sm:text-5xl lg:text-6xl">
            Learn the Earth.
            <br />
            <span className="text-brand-600">Understand the World.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-forest-700 sm:text-lg">
            eAcharya is a modern Geography learning platform for Classes 9–12, aligned with NCERT. Explore
            interactive lessons, rich visual resources, practice assessments and a collaborative learning community.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href="/courses" size="lg">
              Explore Courses
            </ButtonLink>
            <ButtonLink href="/geography-lab" variant="secondary" size="lg">
              Explore Geography Lab
            </ButtonLink>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <Earth3D className="relative mx-auto w-full max-w-[460px] lg:max-w-[520px]" />
        </div>
      </div>
    </section>
  );
}
