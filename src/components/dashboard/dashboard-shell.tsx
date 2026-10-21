import Link from "next/link";
import { Search } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { DASHBOARD_NAV } from "./nav-config";
import { MobileSidebar } from "./mobile-sidebar";
import { ProfileMenu } from "./profile-menu";
import { SidebarNav } from "./sidebar-nav";
import type { SessionProfile } from "@/lib/auth/session";

export function DashboardShell({
  session,
  children,
}: {
  session: SessionProfile;
  children: React.ReactNode;
}) {
  const { profile, email } = session;
  const sections = DASHBOARD_NAV[profile.role];

  return (
    <div className="min-h-screen bg-sand-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sage-200 bg-white p-4 lg:flex">
        <Logo href="/dashboard" className="mb-6 px-2" />
        <div className="min-h-0 flex-1 overflow-y-auto"><SidebarNav sections={sections} /></div>
        <div className="mt-auto rounded-xl bg-sage-50 p-3 text-xs text-forest-600">
          <Link href="/" className="font-semibold text-brand-700 hover:underline">
            Back to website
          </Link>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-sage-200 bg-sand-50/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <MobileSidebar sections={sections} />
            <Logo href="/dashboard" className="lg:hidden" />
          </div>
          <form action="/resources" method="get" role="search" className="mx-auto hidden max-w-md flex-1 md:block">
            <label htmlFor="dash-search" className="sr-only">Search topics, chapters or resources</label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-forest-500" aria-hidden />
              <input
                id="dash-search"
                name="q"
                type="search"
                placeholder="Search topics, chapters or resources..."
                className="h-10 w-full rounded-xl border border-sage-200 bg-white pl-10 pr-3 text-sm placeholder:text-forest-500/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
              />
            </div>
          </form>
          <ProfileMenu name={profile.full_name} email={email} role={profile.role} />
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
