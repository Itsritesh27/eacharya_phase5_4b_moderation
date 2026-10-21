import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/lib/auth/actions";

export const metadata: Metadata = { title: "Account Problem" };

// Deliberately NOT redirected by middleware, so profile problems can never loop.
export default function ProfileErrorPage() {
  return (
    <AuthCard title="We couldn't load your account">
      <div className="space-y-4">
        <Alert tone="error">
          You are signed in, but your profile could not be loaded. Sign out and try again, or contact
          support if this continues.
        </Alert>
        <form action={signOutAction}>
          <Button type="submit" variant="secondary" className="w-full">
            Sign out
          </Button>
        </form>
      </div>
    </AuthCard>
  );
}
