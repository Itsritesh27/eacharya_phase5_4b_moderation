import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/sign-in-form";

export const metadata: Metadata = { title: "Sign In" };

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const initialError =
    error === "link_invalid"
      ? "That link is invalid or has expired. Please sign in or request a new link."
      : undefined;

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to continue learning."
      footer={
        <>
          New to eAcharya?{" "}
          <Link href="/sign-up" className="font-semibold text-brand-700 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <SignInForm next={next} initialError={initialError} />
    </AuthCard>
  );
}
