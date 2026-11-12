// Root layout. Owner: architect-security (keep minimal: <html lang="fr">,
// metadataBase, globals). design-frontend may add fonts/body classes here;
// site chrome (header/footer) belongs in (site)/layout.tsx.
import type { Metadata, Viewport } from "next";
import { SITE, SITE_URL } from "@/lib/config/site";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${SITE.name} — ${SITE.slogan}`, template: `%s | ${SITE.name}` },
  applicationName: SITE.name,
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  themeColor: "#303030",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={SITE.htmlLang}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
