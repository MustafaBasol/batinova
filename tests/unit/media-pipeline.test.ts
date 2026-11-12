import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { cropImageSet, encodeImageSet, inspectUpload } from "@/lib/media/pipeline";
import { csvCell, toCsv } from "@/lib/cms/csv";
import { fromParisLocalInput, toParisLocalInput } from "@/lib/cms/datetime";

async function jpeg(w = 1000, h = 600, opts: { exif?: boolean; orientation?: number } = {}) {
  let s = sharp({ create: { width: w, height: h, channels: 3, background: { r: 200, g: 120, b: 80 } } });
  if (opts.exif) s = s.withExif({ IFD0: { Copyright: "SECRET-OWNER", Artist: "Jean Dupont" }, IFD3: { GPSLatitudeRef: "N" } });
  if (opts.orientation) s = s.withMetadata({ orientation: opts.orientation });
  return s.jpeg().toBuffer();
}

async function expectReject(buf: Uint8Array, code: string, declared?: string) {
  await expect(encodeImageSet(buf, declared)).rejects.toMatchObject({ name: "MediaError", code });
}

describe("upload pipeline: rejects hostile or invalid files", () => {
  it("rejects SVG (even with an image extension/MIME), HTML and scripts", async () => {
    const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    await expectReject(svg, "bad_type", "image/png");
    await expectReject(Buffer.from("<!doctype html><script>alert(1)</script>"), "bad_type", "image/jpeg");
    await expectReject(Buffer.from("<html><body onload=alert(1)>"), "bad_type");
  });

  it("rejects GIF, PDF and empty files", async () => {
    await expectReject(Buffer.from("GIF89a\x01\x00\x01\x00\x00\x00\x00;"), "bad_type");
    await expectReject(Buffer.from("%PDF-1.7\n1 0 obj"), "bad_type");
    await expectReject(Buffer.alloc(0), "empty");
  });

  it("rejects a polyglot that only fakes the magic bytes", async () => {
    const fake = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from("<script>alert(1)</script>".repeat(10))]);
    await expectReject(fake, "bad_image");
    const fakePng = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from("<svg onload=alert(1)>")]);
    await expectReject(fakePng, "bad_image");
  });

  it("rejects a mislabelled file (declared MIME contradicts the real content)", async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#fff" } }).png().toBuffer();
    await expectReject(png, "mismatch", "image/jpeg");
    await expect(encodeImageSet(png, "image/png")).resolves.toBeTruthy();
    await expect(encodeImageSet(png, "application/octet-stream")).resolves.toBeTruthy();
  });

  it("rejects oversized files (> 15 MB) before decoding", async () => {
    const big = Buffer.alloc(15 * 1024 * 1024 + 1);
    big[0] = 0xff; big[1] = 0xd8; big[2] = 0xff;
    await expectReject(big, "too_large");
  });

  it("rejects images over the pixel limit (40 MP)", async () => {
    const huge = await sharp({ create: { width: 7000, height: 6000, channels: 3, background: "#888" } }).png({ compressionLevel: 9 }).toBuffer();
    expect(huge.byteLength).toBeLessThan(15 * 1024 * 1024);
    await expect(inspectUpload(huge)).rejects.toMatchObject({ code: "too_many_pixels" });
  });

  it("rejects tiny images and animated WebP", async () => {
    const tiny = await sharp({ create: { width: 4, height: 4, channels: 3, background: "#000" } }).png().toBuffer();
    await expectReject(tiny, "bad_image");
    const frame = (c: string) => sharp({ create: { width: 40, height: 40, channels: 3, background: c } }).png().toBuffer();
    const anim = await sharp([await frame("#f00"), await frame("#0f0")], { join: { animated: true } })
      .webp({ loop: 0, delay: [100, 100] })
      .toBuffer();
    expect((await sharp(anim, { animated: true }).metadata()).pages).toBe(2);
    await expect(inspectUpload(anim)).rejects.toMatchObject({ code: "animated" });
  });
});

describe("upload pipeline: output", () => {
  it("strips EXIF/GPS metadata and re-encodes", async () => {
    const src = await jpeg(1000, 600, { exif: true });
    const srcMeta = await sharp(src).metadata();
    expect(srcMeta.exif).toBeTruthy();
    const set = await encodeImageSet(src, "image/jpeg");
    for (const out of [set.master, ...set.variants]) {
      const meta = await sharp(out.data).metadata();
      expect(meta.exif).toBeUndefined();
      expect(meta.xmp).toBeUndefined();
      expect(meta.iptc).toBeUndefined();
      expect(out.data.toString("latin1")).not.toContain("SECRET-OWNER");
      expect(out.data.toString("latin1")).not.toContain("Jean Dupont");
    }
  });

  it("drops trailing payloads appended to a valid image (script stays out of the output)", async () => {
    const valid = await jpeg(300, 200);
    const poisoned = Buffer.concat([valid, Buffer.from("<script>alert('x')</script><svg onload=alert(1)>")]);
    const set = await encodeImageSet(poisoned);
    for (const out of [set.master, ...set.variants]) expect(out.data.toString("latin1")).not.toMatch(/<script|<svg|onload/i);
  });

  it("applies EXIF orientation (auto-orient) before stripping", async () => {
    const src = await sharp({ create: { width: 80, height: 40, channels: 3, background: "#369" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
    const set = await encodeImageSet(src);
    expect(set.master.width).toBe(40);
    expect(set.master.height).toBe(80);
  });

  it("preserves transparency (logos): alpha PNG yields only webp/avif outputs that keep the alpha channel", async () => {
    const png = await sharp({ create: { width: 600, height: 200, channels: 4, background: { r: 48, g: 48, b: 48, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 200, height: 100, channels: 4, background: { r: 178, g: 160, b: 140, alpha: 1 } } }).png().toBuffer(), left: 50, top: 50 }])
      .png()
      .toBuffer();
    const set = await encodeImageSet(png, "image/png");
    expect(set.variants.every((v) => v.format === "webp" || v.format === "avif")).toBe(true);
    for (const out of [set.master, ...set.variants]) {
      const meta = await sharp(out.data).metadata();
      expect(meta.hasAlpha, `${meta.format} ${out.width}`).toBe(true);
      const { data, info } = await sharp(out.data).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      expect(data[3]).toBe(0); // top-left corner stays fully transparent
      expect(info.channels).toBe(4);
    }
  });

  it("builds avif+webp variants capped to the source width, master <= 2400 px", async () => {
    const set = await encodeImageSet(await jpeg(1000, 600));
    expect(set.master.width).toBe(1000);
    const widths = [...new Set(set.variants.map((v) => v.width))];
    expect(widths).toEqual([480, 800, 1000]);
    for (const w of widths) {
      expect(set.variants.filter((v) => v.width === w).map((v) => v.format).sort()).toEqual(["avif", "webp"]);
    }
    expect((await sharp(set.variants.find((v) => v.format === "avif")!.data).metadata()).format).toBe("heif");
    const wide = await encodeImageSet(await jpeg(3000, 1500));
    expect(wide.master.width).toBe(2400);
    expect(wide.variants.some((v) => v.width > 2400)).toBe(false);
    expect([...new Set(wide.variants.map((v) => v.width))]).toEqual([480, 800, 1200, 1600, 2400]);
  });

  it("crops from the master (relative and pixel units) and refuses invalid rectangles", async () => {
    const set = await encodeImageSet(await jpeg(1000, 600));
    const rel = await cropImageSet(set.master.data, { x: 0.25, y: 0, width: 0.5, height: 1 }, "relative");
    expect(rel.master.width).toBe(500);
    expect(rel.master.height).toBe(600);
    const px = await cropImageSet(set.master.data, { x: 10, y: 10, width: 200, height: 100 }, "pixels");
    expect([px.master.width, px.master.height]).toEqual([200, 100]);
    await expect(cropImageSet(set.master.data, { x: 900, y: 0, width: 500, height: 100 }, "pixels")).rejects.toMatchObject({ code: "invalid" });
    await expect(cropImageSet(set.master.data, { x: 0, y: 0, width: 2, height: 2 }, "pixels")).rejects.toMatchObject({ code: "invalid" });
  });
});

describe("csv and date helpers", () => {
  it("neutralises formula injection and quotes cells", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")")).toBe('"\'=HYPERLINK(""http://x"")"');
    expect(csvCell("+33 1 23")).toBe("\"'+33 1 23\"");
    expect(csvCell("-2+3")).toBe("\"'-2+3\"");
    expect(csvCell("@SUM(A1)")).toBe("\"'@SUM(A1)\"");
    expect(csvCell("\t=cmd")).toBe("\"'\t=cmd\"");
    expect(csvCell("  =1+1")).toBe("\"'  =1+1\"");
    expect(csvCell("Jean \"Le\" Dupont\nligne 2")).toBe('"Jean ""Le"" Dupont ligne 2"');
    expect(csvCell(null)).toBe('""');
    const csv = toCsv(["a"], [["=1+1"]]);
    expect(csv).toContain("\"'=1+1\"");
  });

  it("converts Europe/Paris wall-clock to UTC across DST", () => {
    expect(fromParisLocalInput("2026-01-15T10:00")?.toISOString()).toBe("2026-01-15T09:00:00.000Z");
    expect(fromParisLocalInput("2026-07-15T10:00")?.toISOString()).toBe("2026-07-15T08:00:00.000Z");
    expect(toParisLocalInput(new Date("2026-07-15T08:00:00Z"))).toBe("2026-07-15T10:00");
    expect(fromParisLocalInput("not a date")).toBeNull();
  });
});
