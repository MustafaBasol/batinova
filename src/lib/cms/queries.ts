import { db } from "@/lib/db";
import { collectMediaIds, parseBlocks } from "@/lib/blocks/schema";
import { mediaUrl } from "@/lib/content/paths";
import { collectRichTextMediaIds } from "@/lib/richtext/schema";
import { formatParis } from "./datetime";
import { listRevisions, type RevisionKind } from "./revisions";

/** Admin read helpers (owner: cms-admin). Pages calling these must have run requireUser()/requireRole(). */
export interface MediaItemDTO {
  id: string;
  url: string;
  alt: string;
  originalName: string;
  width: number | null;
  height: number | null;
  isPlaceholder: boolean;
}

export async function loadMediaItems(ids: (string | null | undefined)[]): Promise<MediaItemDTO[]> {
  const unique = [...new Set(ids.filter((i): i is string => !!i))];
  if (!unique.length) return [];
  const rows = await db.media.findMany({ where: { id: { in: unique }, deletedAt: null } });
  return rows.map((m) => ({ id: m.id, url: mediaUrl(m.storageKey), alt: m.alt, originalName: m.originalName, width: m.width, height: m.height, isPlaceholder: m.isPlaceholder }));
}

export function mediaIdsOfBlocks(blocks: unknown): string[] {
  return collectMediaIds(parseBlocks(blocks).blocks);
}
export const mediaIdsOfDoc = (doc: unknown) => collectRichTextMediaIds(doc);

export async function revisionRows(kind: RevisionKind, id: string) {
  const rows = await listRevisions(kind, id);
  return rows.map((r) => ({ id: r.id, createdAt: formatParis(r.createdAt), author: r.author?.name ?? null }));
}

export const isoOrNull = (d: Date | null) => (d ? d.toISOString() : null);
