import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/config/site";
import { isIndexingEnabled } from "@/lib/seo/indexing";

// Read SITE_INDEXING at request time (not frozen at build).
export const dynamic = "force-dynamic";

export default function robots(): MetadataRoute.Robots {
  if (!isIndexingEnabled()) {
    // Staging / dev / preview: block everything.
    return { rules: [{ userAgent: "*", disallow: "/" }] };
  }
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/api/", "/media/private", "/devis/merci"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
