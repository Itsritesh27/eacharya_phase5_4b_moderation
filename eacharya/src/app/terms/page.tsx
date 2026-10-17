import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/info-page";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <InfoPage title="Terms of Use" intro="Draft summary. Final terms to be reviewed before launch.">
      <p>
        {/* TODO(owner): replace with reviewed terms before accepting real users. */}
        By creating an account you agree to use eAcharya for learning and teaching purposes, to keep your
        credentials private, and not to attempt to access other users&apos; data.
      </p>
      <p>Complete terms of use will be published here.</p>
    </InfoPage>
  );
}
