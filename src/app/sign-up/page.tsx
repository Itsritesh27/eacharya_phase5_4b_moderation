import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "Create Account" };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create your account"
      subtitle="Join eAcharya as a student. Teacher access is granted by an administrator."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/sign-in" className="font-semibold text-brand-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <SignUpForm />
    </AuthCard>
  );
}
