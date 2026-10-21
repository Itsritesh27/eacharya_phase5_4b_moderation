import type { Metadata } from "next";
import { InfoPage } from "@/components/layout/info-page";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy Policy" intro="Draft summary. Final policy to be reviewed before launch.">
      <p>
        {/* TODO(owner): replace with a reviewed privacy policy before accepting real users. */}
        eAcharya stores the information you provide when you create an account: your name, your email
        address and your account role. We use it only to run the platform.
      </p>
      <p>
        Authentication is handled by Supabase. Passwords are never stored by eAcharya in readable form.
        A full privacy policy, including data retention and how to request deletion, will be published here.
      </p>
    </InfoPage>
  );
}
