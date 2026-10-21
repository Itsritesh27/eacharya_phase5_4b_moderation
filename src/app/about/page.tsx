import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/info-page";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <InfoPage
      title="About eAcharya"
      intro="eAcharya is a Geography learning platform for students and teachers in Classes 9–12."
    >
      <p>
        Our concept is simple: learn the Earth, understand the world. The platform organises Geography
        into classes, courses, units and lessons so learners always know where they are in the curriculum.
      </p>
      <p>
        Four learning components are planned: e-Tutorial, e-Content, a Discussion Forum and Assessment.
        This first release provides the foundation: accounts, roles, and the curriculum structure.
      </p>
    </InfoPage>
  );
}
