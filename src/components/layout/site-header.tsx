import Link from "next/link";
import { Logo } from "./logo";
import { MobileMenu } from "./mobile-menu";
import { PUBLIC_NAV } from "./nav-links";
import { ButtonLink } from "@/components/ui/button";
import { isSignedIn } from "@/lib/auth/session";

export async function SiteHeader() {
  const signedIn = await isSignedIn();

  return (
    <header className="relative z-30 border-b border-sage-200/70 bg-sand-50/90 backdrop-blur">
      <div className="container-page flex h-16 items-center justify-between gap-4">
        <Logo />

        <nav aria-label="Primary" className="hidden items-center gap-1 md:flex">
          {PUBLIC_NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-forest-800 hover:bg-sage-100 hover:text-brand-700"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {signedIn ? (
            <ButtonLink href="/dashboard" size="sm">
              Dashboard
            </ButtonLink>
          ) : (
            <>
              <ButtonLink href="/sign-in" variant="ghost" size="sm">
                Sign In
              </ButtonLink>
              <ButtonLink href="/sign-up" size="sm">
                Get Started
              </ButtonLink>
            </>
          )}
        </div>

        <MobileMenu signedIn={signedIn} />
      </div>
    </header>
  );
}
