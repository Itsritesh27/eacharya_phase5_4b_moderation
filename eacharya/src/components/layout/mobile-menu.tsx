"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { PUBLIC_NAV } from "./nav-links";
import { buttonClasses } from "@/components/ui/button";

export function MobileMenu({ signedIn }: { signedIn: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen((v) => !v)}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-forest-900 hover:bg-sage-100"
      >
        {open ? <X className="h-5 w-5" aria-hidden /> : <Menu className="h-5 w-5" aria-hidden />}
      </button>

      {open && (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          className="absolute inset-x-0 top-full border-b border-sage-200 bg-sand-50 px-4 pb-5 pt-2 shadow-lift"
        >
          <ul className="flex flex-col">
            {PUBLIC_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-3 py-3 text-base font-medium text-forest-900 hover:bg-sage-100"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex gap-3">
            {signedIn ? (
              <Link href="/dashboard" className={buttonClasses("primary", "md", "flex-1")}>
                Dashboard
              </Link>
            ) : (
              <>
                <Link href="/sign-in" className={buttonClasses("secondary", "md", "flex-1")}>
                  Sign In
                </Link>
                <Link href="/sign-up" className={buttonClasses("primary", "md", "flex-1")}>
                  Get Started
                </Link>
              </>
            )}
          </div>
        </nav>
      )}
    </div>
  );
}
