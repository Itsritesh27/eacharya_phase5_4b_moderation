import Link from "next/link";
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
  const items = DASHBOARD_NAV[profile.role];

  return (
    <div className="min-h-screen bg-sand-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-sage-200 bg-white p-4 lg:flex">
        <Logo href="/dashboard" className="mb-6 px-2" />
        <SidebarNav items={items} />
        <div className="mt-auto rounded-xl bg-sage-50 p-3 text-xs text-forest-600">
          <Link href="/" className="font-semibold text-brand-700 hover:underline">
            Back to website
          </Link>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between gap-3 border-b border-sage-200 bg-sand-50/90 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-2">
            <MobileSidebar items={items} />
            <Logo href="/dashboard" className="lg:hidden" />
          </div>
          <ProfileMenu name={profile.full_name} email={email} role={profile.role} />
        </header>

        <main id="main" className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
