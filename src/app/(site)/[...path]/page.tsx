// Catch-all for every published CMS Page (à-propos, services/*, zones-intervention/*, legal, contact…).
import type { Metadata } from "next";
import { toPagePath } from "@/lib/content/paths";
import { pageMetadata, renderPage } from "@/components/views/page-route";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ path: string[] }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { path } = await params;
  return pageMetadata(toPagePath(path));
}

export default async function CmsPage({ params }: Props) {
  const { path } = await params;
  return renderPage(path);
}
