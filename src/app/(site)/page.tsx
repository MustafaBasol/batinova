// Home: CMS page with path "" (design-frontend). Fetch + render only.
import type { Metadata } from "next";
import { SITE } from "@/lib/config/site";
import { getPublishedPageByPath } from "@/lib/content/public";
import { pageMetadata, renderPage } from "@/components/views/page-route";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const page = await getPublishedPageByPath("");
  if (!page) return { title: `${SITE.name} — ${SITE.slogan}` };
  const meta = await pageMetadata("");
  return { ...meta, title: { absolute: String(meta.title) } };
}

export default async function HomePage() {
  return renderPage("");
}
