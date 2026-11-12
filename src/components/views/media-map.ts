import "server-only";
import { collectMediaIds, type CmsBlock } from "@/lib/blocks/schema";
import { collectRichTextMediaIds } from "@/lib/richtext/schema";
import { getMediaByIds } from "@/lib/content/public";
import type { MediaLike } from "@/components/media/ResponsiveImage";

/** Loads the media referenced by blocks (+ optional rich-text docs) into the map expected by the views. */
export async function loadMediaMap(blocks: CmsBlock[], docs: unknown[] = [], extraIds: string[] = []): Promise<Record<string, MediaLike>> {
  const ids = new Set<string>([...collectMediaIds(blocks), ...extraIds]);
  for (const d of docs) collectRichTextMediaIds(d).forEach((i) => ids.add(i));
  const map = await getMediaByIds([...ids]);
  return Object.fromEntries(map);
}
