import "server-only";
import { db } from "@/lib/db";
import { Prisma, type LicenseType, type Media } from "@/generated/prisma/client";
import { parseBlocks, collectMediaIds } from "@/lib/blocks/schema";
import { collectRichTextMediaIds } from "@/lib/richtext/schema";
import { audit } from "@/lib/security/audit";
import { isSafeHref } from "@/lib/security/href";
import { generateStorageKey, getPrivateStorage, getPublicStorage, sanitizeOriginalName } from "@/lib/storage";
import {
  MediaError,
  cropImageSet,
  encodeImageSet,
  type CropRect,
  type ImageSet,
  type MediaVariant,
} from "./pipeline";

export { MediaError } from "./pipeline";
export type { MediaVariant, CropRect } from "./pipeline";

/**
 * Media service (owner: cms-admin) — the only writer of Media rows + files.
 *
 * Storage layout:
 *  - public  (served by /media/<key>):   <yyyy>/<mm>/<hex>.webp  (= Media.storageKey, largest <= 2400 px)
 *                                         <yyyy>/<mm>/<hex>-w<width>.(webp|avif) (= Media.variants)
 *  - private (never public):             masters/<yyyy>/<mm>/<hex>.webp — sanitised, uncropped "master".
 * Cropping always re-crops from the master (non-destructive: you can re-crop later);
 * `Media.crop` = { x, y, width, height, masterKey } in master pixels. Master for rows
 * without a private master (rows inserted by seeds) falls back to the stored largest version.
 * Keys are immutable (CDN `immutable` caching): crop / replace write NEW keys, then delete old files.
 * References are by Media.id, so alt/caption/credit/usages survive crop and replace.
 */
export interface CreateMediaInput {
  buffer: Uint8Array;
  originalName: string;
  alt: string;
  caption?: string | null;
  credit?: string | null;
  licenseType: LicenseType;
  licenseSource?: string | null;
  licenseNotes?: string | null;
  isPlaceholder: boolean;
  uploadedById?: string | null;
  /** Client-declared MIME; rejected when it contradicts the real content. */
  declaredMime?: string | null;
}

const clip = (v: string | null | undefined, max: number) => {
  const t = (v ?? "").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
  return t === "" ? null : t;
};

function cleanLicenseSource(v: string | null | undefined): string | null {
  const t = clip(v, 500);
  if (!t) return null;
  return isSafeHref(t) && t.toLowerCase().startsWith("https://") ? t : t.slice(0, 200).replace(/[<>"]/g, "");
}

function baseOf(key: string): string {
  return key.replace(/\.[a-z0-9]+$/, "");
}

interface WrittenSet {
  storageKey: string;
  masterKey: string;
  variants: MediaVariant[];
  keys: { pub: string[]; priv: string[] };
}

async function writeSet(set: ImageSet, writeMaster: boolean, now = new Date()): Promise<WrittenSet> {
  const pub = getPublicStorage();
  const priv = getPrivateStorage();
  const storageKey = generateStorageKey("webp", { now });
  const base = baseOf(storageKey);
  const keys = { pub: [] as string[], priv: [] as string[] };
  const variants: MediaVariant[] = [];
  try {
    await pub.put(storageKey, set.master.data, "image/webp");
    keys.pub.push(storageKey);
    for (const v of set.variants) {
      if (v.format === "webp" && v.width === set.master.width) {
        variants.push({ key: storageKey, width: v.width, height: v.height, format: "webp" });
        continue;
      }
      const key = `${base}-w${v.width}.${v.format}`;
      await pub.put(key, v.data, `image/${v.format}`);
      keys.pub.push(key);
      variants.push({ key, width: v.width, height: v.height, format: v.format });
    }
    const masterKey = `masters/${storageKey}`;
    if (writeMaster) {
      await priv.put(masterKey, set.master.data, "image/webp");
      keys.priv.push(masterKey);
    }
    return { storageKey, masterKey, variants, keys };
  } catch (err) {
    await removeKeys(keys);
    throw err;
  }
}

async function removeKeys(keys: { pub: string[]; priv: string[] }) {
  await Promise.all([
    ...keys.pub.map((k) => getPublicStorage().delete(k).catch(() => undefined)),
    ...keys.priv.map((k) => getPrivateStorage().delete(k).catch(() => undefined)),
  ]);
}

function variantsOf(row: Pick<Media, "variants" | "storageKey">): MediaVariant[] {
  return Array.isArray(row.variants) ? (row.variants as unknown as MediaVariant[]).filter((v) => v && typeof v.key === "string") : [];
}

function filesOf(row: Pick<Media, "variants" | "storageKey" | "crop">) {
  const pub = new Set<string>([row.storageKey, ...variantsOf(row).map((v) => v.key)]);
  const priv = new Set<string>();
  const crop = row.crop as { masterKey?: string } | null;
  priv.add(crop?.masterKey ?? `masters/${row.storageKey}`);
  return { pub: [...pub], priv: [...priv] };
}

export async function createMediaFromBuffer(input: CreateMediaInput): Promise<Media> {
  const set = await encodeImageSet(input.buffer, input.declaredMime);
  const written = await writeSet(set, true);
  try {
    const row = await db.media.create({
      data: {
        storageKey: written.storageKey,
        originalName: sanitizeOriginalName(input.originalName),
        mime: "image/webp",
        sizeBytes: set.master.data.byteLength,
        width: set.master.width,
        height: set.master.height,
        alt: (clip(input.alt, 300) ?? ""),
        caption: clip(input.caption, 300),
        credit: clip(input.credit, 200),
        licenseType: input.licenseType,
        licenseSource: cleanLicenseSource(input.licenseSource),
        licenseNotes: clip(input.licenseNotes, 500),
        isPlaceholder: input.isPlaceholder,
        variants: written.variants as unknown as object,
        uploadedById: input.uploadedById ?? null,
      },
    });
    await audit(input.uploadedById ?? null, "media.upload", { type: "Media", id: row.id }, { bytes: input.buffer.byteLength });
    return row;
  } catch (err) {
    await removeKeys(written.keys);
    throw err;
  }
}

async function loadMaster(row: Media): Promise<Buffer> {
  const crop = row.crop as { masterKey?: string } | null;
  const masterKey = crop?.masterKey ?? `masters/${row.storageKey}`;
  const fromPrivate = await getPrivateStorage().read(masterKey);
  if (fromPrivate) return fromPrivate;
  const fallback = await getPublicStorage().read(row.storageKey);
  if (!fallback) throw new MediaError("Fichier source introuvable.", "not_found");
  await getPrivateStorage().put(masterKey, fallback, "image/webp").catch(() => undefined); // lazy master for seeded rows
  return fallback;
}

/** Master (uncropped) bytes for the crop UI — callers must be authorised. */
export async function readMediaMaster(mediaId: string): Promise<Buffer | null> {
  const row = await db.media.findUnique({ where: { id: mediaId } });
  if (!row) return null;
  return loadMaster(row);
}

async function getLive(mediaId: string): Promise<Media> {
  const row = await db.media.findUnique({ where: { id: mediaId } });
  if (!row) throw new MediaError("Média introuvable.", "not_found");
  return row;
}

/** Non-destructive crop, always from the master. `unit` defaults to master pixels. */
export async function cropMedia(
  mediaId: string,
  rect: CropRect,
  actorId: string | null,
  opts: { unit?: "pixels" | "relative" } = {},
): Promise<Media> {
  const row = await getLive(mediaId);
  const master = await loadMaster(row);
  const set = await cropImageSet(master, rect, opts.unit ?? "pixels");
  const written = await writeSet(set, false);
  const masterKey = (row.crop as { masterKey?: string } | null)?.masterKey ?? `masters/${row.storageKey}`;
  try {
    const updated = await db.media.update({
      where: { id: mediaId },
      data: {
        storageKey: written.storageKey,
        sizeBytes: set.master.data.byteLength,
        width: set.master.width,
        height: set.master.height,
        mime: "image/webp",
        variants: written.variants as unknown as object,
        crop: { ...set.rectPx, masterKey } as unknown as object,
        focalX: null,
        focalY: null,
      },
    });
    await removeKeys({ pub: filesOf(row).pub, priv: [] }); // keep the master for future re-crops
    await audit(actorId, "media.crop", { type: "Media", id: mediaId });
    return updated;
  } catch (err) {
    await removeKeys(written.keys);
    throw err;
  }
}

export async function setFocalPoint(mediaId: string, x: number, y: number, actorId: string | null): Promise<Media> {
  if (![x, y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) throw new MediaError("Point focal invalide.", "invalid");
  await getLive(mediaId);
  const row = await db.media.update({ where: { id: mediaId }, data: { focalX: x, focalY: y } });
  await audit(actorId, "media.focal", { type: "Media", id: mediaId });
  return row;
}

/** Replaces the picture but keeps id, alt, caption, credit, licence and every CMS reference. */
export async function replaceMediaFile(
  mediaId: string,
  buffer: Uint8Array,
  actorId: string | null = null,
  declaredMime?: string | null,
): Promise<Media> {
  const row = await getLive(mediaId);
  const set = await encodeImageSet(buffer, declaredMime);
  const written = await writeSet(set, true);
  const old = filesOf(row);
  try {
    const updated = await db.media.update({
      where: { id: mediaId },
      data: {
        storageKey: written.storageKey,
        sizeBytes: set.master.data.byteLength,
        width: set.master.width,
        height: set.master.height,
        mime: "image/webp",
        variants: written.variants as unknown as object,
        crop: Prisma.DbNull,
        focalX: null,
        focalY: null,
      },
    });
    await removeKeys(old);
    await audit(actorId, "media.replace", { type: "Media", id: mediaId });
    return updated;
  } catch (err) {
    await removeKeys(written.keys);
    throw err;
  }
}

export interface MediaMetaInput {
  alt: string;
  caption?: string | null;
  credit?: string | null;
  licenseType: LicenseType;
  licenseSource?: string | null;
  licenseNotes?: string | null;
  isPlaceholder: boolean;
}

export async function updateMediaMeta(mediaId: string, input: MediaMetaInput, actorId: string | null): Promise<Media> {
  await getLive(mediaId);
  const row = await db.media.update({
    where: { id: mediaId },
    data: {
      alt: clip(input.alt, 300) ?? "",
      caption: clip(input.caption, 300),
      credit: clip(input.credit, 200),
      licenseType: input.licenseType,
      licenseSource: cleanLicenseSource(input.licenseSource),
      licenseNotes: clip(input.licenseNotes, 500),
      isPlaceholder: input.isPlaceholder,
    },
  });
  await audit(actorId, "media.update", { type: "Media", id: mediaId });
  return row;
}

// ---------------------------------------------------------------- usages & deletion

export interface MediaUsage {
  type: "page" | "post" | "project" | "category" | "settings";
  id: string;
  title: string;
  field: string;
  trashed: boolean;
}

export async function findMediaUsages(mediaId: string): Promise<MediaUsage[]> {
  const out: MediaUsage[] = [];
  const [pages, posts, projects, cats, seo] = await Promise.all([
    db.page.findMany({ select: { id: true, title: true, blocks: true, ogImageId: true, deletedAt: true } }),
    db.post.findMany({ select: { id: true, title: true, body: true, blocks: true, coverImageId: true, ogImageId: true, deletedAt: true } }),
    db.project.findMany({
      select: { id: true, title: true, blocks: true, coverImageId: true, ogImageId: true, deletedAt: true, media: { select: { mediaId: true } } },
    }),
    db.category.findMany({ where: { ogImageId: mediaId }, select: { id: true, name: true, deletedAt: true } }),
    db.setting.findUnique({ where: { key: "seo" } }),
  ]);
  const inBlocks = (blocks: unknown) => collectMediaIds(parseBlocks(blocks).blocks).includes(mediaId);
  for (const p of pages) {
    if (inBlocks(p.blocks)) out.push({ type: "page", id: p.id, title: p.title, field: "contenu", trashed: !!p.deletedAt });
    if (p.ogImageId === mediaId) out.push({ type: "page", id: p.id, title: p.title, field: "image de partage", trashed: !!p.deletedAt });
  }
  for (const p of posts) {
    if (p.coverImageId === mediaId) out.push({ type: "post", id: p.id, title: p.title, field: "image de couverture", trashed: !!p.deletedAt });
    if (p.ogImageId === mediaId) out.push({ type: "post", id: p.id, title: p.title, field: "image de partage", trashed: !!p.deletedAt });
    if (collectRichTextMediaIds(p.body).includes(mediaId) || inBlocks(p.blocks))
      out.push({ type: "post", id: p.id, title: p.title, field: "contenu", trashed: !!p.deletedAt });
  }
  for (const p of projects) {
    if (p.coverImageId === mediaId) out.push({ type: "project", id: p.id, title: p.title, field: "image de couverture", trashed: !!p.deletedAt });
    if (p.ogImageId === mediaId) out.push({ type: "project", id: p.id, title: p.title, field: "image de partage", trashed: !!p.deletedAt });
    if (p.media.some((m) => m.mediaId === mediaId)) out.push({ type: "project", id: p.id, title: p.title, field: "galerie", trashed: !!p.deletedAt });
    if (inBlocks(p.blocks)) out.push({ type: "project", id: p.id, title: p.title, field: "contenu", trashed: !!p.deletedAt });
  }
  for (const c of cats) out.push({ type: "category", id: c.id, title: c.name, field: "image de partage", trashed: !!c.deletedAt });
  if (seo && (seo.value as { defaultOgImageId?: string | null } | null)?.defaultOgImageId === mediaId) {
    out.push({ type: "settings", id: "seo", title: "Réglages SEO", field: "image de partage par défaut", trashed: false });
  }
  return out;
}

export async function softDeleteMedia(mediaId: string, actorId: string | null): Promise<void> {
  await getLive(mediaId);
  await db.media.update({ where: { id: mediaId }, data: { deletedAt: new Date(), deletedById: actorId } });
  await audit(actorId, "media.delete", { type: "Media", id: mediaId });
}

export async function restoreMedia(mediaId: string, actorId: string | null): Promise<void> {
  await getLive(mediaId);
  await db.media.update({ where: { id: mediaId }, data: { deletedAt: null, deletedById: null } });
  await audit(actorId, "media.restore", { type: "Media", id: mediaId });
}

/** Permanent deletion (OWNER, caller authorises). Refused while ANY content (even trashed) references it. */
export async function hardDeleteMedia(mediaId: string, actorId: string | null): Promise<void> {
  const row = await getLive(mediaId);
  if (!row.deletedAt) throw new MediaError("Placez d’abord le média dans la corbeille.", "invalid");
  const usages = await findMediaUsages(mediaId);
  if (usages.length > 0) {
    throw new MediaError(`Ce média est encore utilisé (${usages.length} emplacement${usages.length > 1 ? "s" : ""}). Retirez-le d’abord.`, "in_use");
  }
  await db.media.delete({ where: { id: mediaId } });
  await removeKeys(filesOf(row));
  await audit(actorId, "media.purge", { type: "Media", id: mediaId });
}
