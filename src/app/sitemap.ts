import type { MetadataRoute } from "next";
import { isIndexingEnabled } from "@/lib/seo/indexing";
import { getSitemapEntries } from "@/lib/seo/sitemap-data";

// Request-time: scheduled posts/pages become visible without a rebuild.
export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Non-production deployments expose no URL list at all.
  if (!isIndexingEnabled()) return [];
  return getSitemapEntries();
}
