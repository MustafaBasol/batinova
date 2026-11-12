"use client";
// Tiny id -> public URL cache used by the editor's image node (owner: cms-admin).
import { mediaUrl } from "@/lib/content/paths";
import type { MediaItem } from "../MediaPicker";

const urls = new Map<string, string>();

export function seedMedia(items: MediaItem[]) {
  for (const i of items) urls.set(i.id, i.url);
}
export function mediaUrlFor(id: string): string | null {
  return urls.get(id) ?? null;
}
export { mediaUrl };
