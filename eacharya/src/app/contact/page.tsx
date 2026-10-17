import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/info-page";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <InfoPage title="Contact" intro="We would like to hear from teachers, students and schools.">
      <p>
        {/* TODO(owner): replace with the real support email or contact form. */}
        Contact details have not been published yet. They will be added here before launch.
      </p>
    </InfoPage>
  );
}
