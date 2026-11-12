// Public site layout (design-frontend): fonts + header/footer chrome. Content is request-time (scheduled publishing).
// seo-content additions: Search Console verification meta tag and consent-gated analytics.
import type { Metadata } from "next";
import { SiteShell } from "@/components/site/SiteShell";
import { Analytics } from "@/components/seo/Analytics";
import { getSettings } from "@/lib/content/public";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const token = (await getSettings()).seo.googleSiteVerification;
  return token ? { verification: { google: token } } : {};
}

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return (
    <SiteShell>
      {children}
      <Analytics />
    </SiteShell>
  );
}
