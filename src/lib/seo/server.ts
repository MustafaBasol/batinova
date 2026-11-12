import "server-only";
import type { Metadata } from "next";
import { getMediaById, getSettings } from "@/lib/content/public";
import { buildMetadata, type BuildMetadataInput } from "./metadata";
import { seoImageFromMedia, type SeoImage, type SeoMediaLike } from "./media";

/**
 * Async wrapper used by every public route: injects the editable site defaults
 * (default meta description, default OG image) before calling buildMetadata.
 */
export async function seoMetadata(input: BuildMetadataInput): Promise<Metadata> {
  const settings = await getSettings();
  let defaultImage: SeoImage | null = null;
  const defId = settings.seo.defaultOgImageId;
  if (!input.ogImage && defId) defaultImage = seoImageFromMedia(await getMediaById(defId));
  return buildMetadata({
    ...input,
    defaultDescription: input.defaultDescription ?? settings.seo.defaultMetaDescription,
    defaultImage: input.defaultImage ?? defaultImage,
  });
}

/** Image input for buildMetadata from a media row (picks a >=1200px variant). */
export function ogFromMedia(m: SeoMediaLike | null | undefined): SeoImage | null {
  return seoImageFromMedia(m);
}
