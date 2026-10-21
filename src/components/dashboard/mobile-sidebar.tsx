"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { SidebarNav } from "./sidebar-nav";
import type { NavSection } from "./nav-config";

export function MobileSidebar({ sections }: { sections: NavSection[] }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="flex h-10 w-10 items-center justify-center rounded-lg text-forest-900 hover:bg-sage-100"
      >
        <Menu className="h-5 w-5" aria-hidden />
      </button>

      {open && (
        <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-forest-950/50"
            onClick={() => setOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col overflow-y-auto bg-white p-4 shadow-lift">
            <div className="mb-4 flex items-center justify-between">
              <Logo href="/dashboard" />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close navigation"
                className="flex h-9 w-9 items-center justify-center rounded-lg hover:bg-sage-100"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>
            <SidebarNav sections={sections} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
