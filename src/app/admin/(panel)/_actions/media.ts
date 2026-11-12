"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRole } from "@/lib/auth/guards";
import { LICENSE_TYPES } from "@/lib/cms/constants";
import { parseOrThrow, runAction, type ActionResult } from "@/lib/cms/result";
import { cropMedia, findMediaUsages, setFocalPoint, updateMediaMeta, type MediaUsage } from "@/lib/media/service";

/** Media Server Actions (owner: cms-admin). EDITOR+. File uploads go through the route handler. */
const MetaSchema = z.object({
  id: z.string().min(1).max(64),
  alt: z.string().max(300),
  caption: z.string().max(300).nullish(),
  credit: z.string().max(200).nullish(),
  licenseType: z.enum(LICENSE_TYPES),
  licenseSource: z.string().max(500).nullish(),
  licenseNotes: z.string().max(500).nullish(),
  isPlaceholder: z.boolean(),
});

export async function updateMediaAction(input: unknown): Promise<ActionResult> {
  const user = await requireRole("EDITOR");
  const r = await runAction(async () => {
    const { id, ...meta } = parseOrThrow(MetaSchema, input);
    await updateMediaMeta(id, meta, user.id);
  }, "Média enregistré.");
  if (r.ok) revalidatePath("/admin/mediatheque");
  return r;
}

const CropSchema = z.object({
  id: z.string().min(1).max(64),
  x: z.number().min(0), y: z.number().min(0), width: z.number().positive(), height: z.number().positive(),
  unit: z.enum(["pixels", "relative"]).default("pixels"),
});

export async function cropMediaAction(input: unknown): Promise<ActionResult> {
  const user = await requireRole("EDITOR");
  const r = await runAction(async () => {
    const { id, unit, ...rect } = parseOrThrow(CropSchema, input);
    await cropMedia(id, rect, user.id, { unit });
  }, "Recadrage appliqué.");
  if (r.ok) revalidatePath("/admin/mediatheque", "layout");
  return r;
}

const FocalSchema = z.object({ id: z.string().min(1).max(64), x: z.number().min(0).max(1), y: z.number().min(0).max(1) });

export async function setFocalPointAction(input: unknown): Promise<ActionResult> {
  const user = await requireRole("EDITOR");
  const r = await runAction(async () => {
    const a = parseOrThrow(FocalSchema, input);
    await setFocalPoint(a.id, a.x, a.y, user.id);
  }, "Point focal enregistré.");
  if (r.ok) revalidatePath("/admin/mediatheque", "layout");
  return r;
}

export async function mediaUsagesAction(id: string): Promise<ActionResult<MediaUsage[]>> {
  await requireRole("EDITOR");
  return runAction(() => findMediaUsages(String(id)));
}
