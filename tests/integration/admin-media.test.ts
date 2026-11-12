import sharp from "sharp";
import { beforeEach, describe, expect, it } from "vitest";
import { resetDb, db } from "../support/db";
import {
  MediaError,
  createMediaFromBuffer,
  cropMedia,
  findMediaUsages,
  hardDeleteMedia,
  replaceMediaFile,
  restoreMedia,
  setFocalPoint,
  softDeleteMedia,
  updateMediaMeta,
} from "@/lib/media/service";
import { getPublicStorage, getPrivateStorage } from "@/lib/storage";
import { getMediaById } from "@/lib/content/public";

const photo = (w = 1000, h = 600, color = "#c87850") =>
  sharp({ create: { width: w, height: h, channels: 3, background: color } })
    .withExif({ IFD0: { Copyright: "PRIVATE-EXIF" } })
    .jpeg()
    .toBuffer();

const base = { alt: "Façade rénovée", licenseType: "OWNED" as const, isPlaceholder: false };

beforeEach(resetDb);

describe("createMediaFromBuffer", () => {
  it("stores a stripped master + avif/webp variants and records dimensions", async () => {
    const m = await createMediaFromBuffer({ ...base, buffer: await photo(), originalName: "../../Ma Photo <b>.JPG", credit: "Studio X", licenseSource: "https://example.com/p" });
    expect(m.mime).toBe("image/webp");
    expect(m.storageKey).toMatch(/^\d{4}\/\d{2}\/[0-9a-f]{24}\.webp$/);
    expect([m.width, m.height]).toEqual([1000, 600]);
    expect(m.originalName).not.toMatch(/[<>\\/]/);
    const variants = m.variants as { key: string; width: number; height: number; format: string }[];
    expect(variants.map((v) => `${v.width}.${v.format}`).sort()).toEqual(["1000.avif", "1000.webp", "480.avif", "480.webp", "800.avif", "800.webp"]);
    const pub = getPublicStorage();
    for (const v of variants) expect(await pub.exists(v.key)).toBe(true);
    const bytes = (await pub.read(m.storageKey))!;
    expect(bytes.toString("latin1")).not.toContain("PRIVATE-EXIF");
    expect((await sharp(bytes).metadata()).exif).toBeUndefined();
    expect(await getPrivateStorage().exists(`masters/${m.storageKey}`)).toBe(true); // master is private
    expect((await getMediaById(m.id))?.alt).toBe("Façade rénovée");
    expect((await db.auditLog.findFirst({ where: { action: "media.upload" } }))?.entityId).toBe(m.id);
  });

  it("rejects hostile uploads without leaving rows or files", async () => {
    await expect(createMediaFromBuffer({ ...base, buffer: Buffer.from("<svg onload=alert(1)>"), originalName: "x.png" })).rejects.toBeInstanceOf(MediaError);
    await expect(createMediaFromBuffer({ ...base, buffer: await photo(), originalName: "a.jpg", declaredMime: "image/png" })).rejects.toMatchObject({ code: "mismatch" });
    expect(await db.media.count()).toBe(0);
  });

  it("sanitises licence source that is not an https URL", async () => {
    const m = await createMediaFromBuffer({ ...base, buffer: await photo(200, 200), originalName: "a.jpg", licenseSource: "javascript:alert(1)<x>" });
    expect(m.licenseSource).not.toMatch(/[<>]/);
  });
});

describe("crop, focal point, replace, delete", () => {
  it("crops non-destructively from the master and removes superseded public files", async () => {
    const m = await createMediaFromBuffer({ ...base, buffer: await photo(), originalName: "a.jpg" });
    const oldVariants = (m.variants as { key: string }[]).map((v) => v.key);
    const c1 = await cropMedia(m.id, { x: 0.25, y: 0, width: 0.5, height: 1 }, null, { unit: "relative" });
    expect([c1.width, c1.height]).toEqual([500, 600]);
    expect(c1.id).toBe(m.id);
    expect(c1.alt).toBe(m.alt);
    expect(c1.storageKey).not.toBe(m.storageKey);
    for (const k of oldVariants) expect(await getPublicStorage().exists(k)).toBe(false);
    // second crop is taken from the ORIGINAL master (can widen again)
    const c2 = await cropMedia(m.id, { x: 0, y: 0, width: 1, height: 0.5 }, null, { unit: "relative" });
    expect([c2.width, c2.height]).toEqual([1000, 300]);
    await expect(cropMedia(m.id, { x: 0, y: 0, width: 5000, height: 5000 }, null)).rejects.toMatchObject({ code: "invalid" });
  });

  it("validates and stores a focal point", async () => {
    const m = await createMediaFromBuffer({ ...base, buffer: await photo(200, 200), originalName: "a.jpg" });
    const f = await setFocalPoint(m.id, 0.3, 0.7, null);
    expect([f.focalX, f.focalY]).toEqual([0.3, 0.7]);
    await expect(setFocalPoint(m.id, 1.5, 0, null)).rejects.toBeInstanceOf(MediaError);
  });

  it("replaces the file but keeps id, alt and credit (CMS references stay valid)", async () => {
    const m = await createMediaFromBuffer({ ...base, buffer: await photo(), originalName: "a.jpg", credit: "Studio X" });
    const r = await replaceMediaFile(m.id, await photo(600, 600, "#336699"), null);
    expect(r.id).toBe(m.id);
    expect(r.alt).toBe("Façade rénovée");
    expect(r.credit).toBe("Studio X");
    expect(r.storageKey).not.toBe(m.storageKey);
    expect([r.width, r.height]).toEqual([600, 600]);
    expect(await getPublicStorage().exists(m.storageKey)).toBe(false);
    await expect(replaceMediaFile(m.id, Buffer.from("<svg/>"), null)).rejects.toBeInstanceOf(MediaError);
    expect((await db.media.findUniqueOrThrow({ where: { id: m.id } })).storageKey).toBe(r.storageKey);
  });

  it("soft delete hides media from public queries; restore brings it back", async () => {
    const m = await createMediaFromBuffer({ ...base, buffer: await photo(200, 200), originalName: "a.jpg" });
    await softDeleteMedia(m.id, null);
    expect(await getMediaById(m.id)).toBeNull();
    await restoreMedia(m.id, null);
    expect(await getMediaById(m.id)).not.toBeNull();
  });

  it("hard delete requires trash first and is refused while any content uses it", async () => {
    const m = await createMediaFromBuffer({ ...base, buffer: await photo(200, 200), originalName: "a.jpg" });
    await expect(hardDeleteMedia(m.id, null)).rejects.toMatchObject({ code: "invalid" });
    const post = await db.post.create({ data: { slug: "p", title: "P", body: { type: "doc", content: [{ type: "paragraph" }] }, coverImageId: m.id, deletedAt: new Date() } });
    const page = await db.page.create({
      data: { path: "x", title: "X", blocks: [{ type: "image", mediaId: m.id }] },
    });
    await softDeleteMedia(m.id, null);
    const usages = await findMediaUsages(m.id);
    expect(usages.map((u) => `${u.type}:${u.field}:${u.trashed}`).sort()).toEqual(["page:contenu:false", "post:image de couverture:true"]);
    await expect(hardDeleteMedia(m.id, null)).rejects.toMatchObject({ code: "in_use" });
    await db.post.delete({ where: { id: post.id } });
    await db.page.delete({ where: { id: page.id } });
    await hardDeleteMedia(m.id, null);
    expect(await db.media.count()).toBe(0);
    expect(await getPublicStorage().exists(m.storageKey)).toBe(false);
  });

  it("updates metadata (alt, licence, placeholder flag)", async () => {
    const m = await createMediaFromBuffer({ ...base, alt: "", buffer: await photo(200, 200), originalName: "a.jpg" });
    expect(m.alt).toBe("");
    const u = await updateMediaMeta(m.id, { alt: "  Cuisine ouverte  ", licenseType: "STOCK_FREE", licenseSource: "https://unsplash.com/x", credit: "Photographe", isPlaceholder: true }, null);
    expect(u).toMatchObject({ alt: "Cuisine ouverte", licenseType: "STOCK_FREE", isPlaceholder: true });
  });
});
