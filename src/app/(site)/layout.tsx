// Public site layout (design-frontend): fonts + header/footer chrome. Content is request-time (scheduled publishing).
import { SiteShell } from "@/components/site/SiteShell";

export const dynamic = "force-dynamic";

export default function SiteLayout({ children }: { children: React.ReactNode }) {
  return <SiteShell>{children}</SiteShell>;
}
