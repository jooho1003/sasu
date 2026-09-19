import { SiteFooter, SiteHeader } from "@/components/site-shell";
import { siteLinks } from "@/lib/site";

export default function PublicSiteLayout({ children }: { children: React.ReactNode }) {
  const links = siteLinks();
  return (
    <div className="min-h-screen overflow-x-hidden">
      <SiteHeader links={links} />
      {children}
      <SiteFooter links={links} />
    </div>
  );
}
