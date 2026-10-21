import { SiteFooter } from "./site-footer";
import { SiteHeader } from "./site-header";

/** Standard wrapper for public pages. */
export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SiteHeader />
      <main id="main">{children}</main>
      <SiteFooter />
    </>
  );
}
