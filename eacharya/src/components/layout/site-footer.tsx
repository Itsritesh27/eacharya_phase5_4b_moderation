import Link from "next/link";
import { Logo } from "./logo";

const LINKS = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/sign-in", label: "Sign In" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-sage-200 bg-white">
      <div className="container-page flex flex-col gap-6 py-10 md:flex-row md:items-center md:justify-between">
        <div>
          <Logo />
          <p className="mt-2 max-w-xs text-sm text-forest-600">Learn the Earth. Understand the World.</p>
        </div>
        <nav aria-label="Footer">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-sm font-medium text-forest-700 hover:text-brand-700">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-sage-100 py-4 text-center text-xs text-forest-500">
        © {new Date().getFullYear()} eAcharya. All rights reserved.
      </div>
    </footer>
  );
}
