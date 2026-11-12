/**
 * Rebuilds ALL brand derivatives from the official sources in assets/branding/ (re-runnable):
 *   node scripts/build-brand-assets.mjs
 * Sources (never modified): logo_batinova_construction.png (colour), logo_batinova_monochrome.png,
 * icone_batinova_minimaliste.png. Artwork is only trimmed (transparent margins), resized proportionally
 * or recoloured (onDark = monochrome alpha mask recoloured to off-white) — never redrawn/stretched/cropped.
 * Alpha < 16 is zeroed in derivatives. Prints dimensions to keep src/components/site/brand-assets.ts in sync.
 */
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "assets/branding");
const BRAND = path.join(root, "public/brand");
const ICONS = path.join(root, "public/icons");
const OFFWHITE = { r: 245, g: 242, b: 236 };
fs.mkdirSync(BRAND, { recursive: true });
fs.mkdirSync(ICONS, { recursive: true });

/** Load RGBA, zero faint alpha, optionally recolour, trim transparent margins. Returns {data,width,height}. */
async function loadTrimmed(file, recolour) {
  const { data, info } = await sharp(path.join(SRC, file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: H } = info;
  let minx = W, miny = H, maxx = -1, maxy = -1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 4;
      if (data[p + 3] < 16) {
        data[p + 3] = 0;
        continue;
      }
      if (recolour) {
        data[p] = recolour.r;
        data[p + 1] = recolour.g;
        data[p + 2] = recolour.b;
      }
      if (x < minx) minx = x;
      if (x > maxx) maxx = x;
      if (y < miny) miny = y;
      if (y > maxy) maxy = y;
    }
  const box = { left: minx, top: miny, width: maxx - minx + 1, height: maxy - miny + 1 };
  const png = await sharp(data, { raw: { width: W, height: H, channels: 4 } }).extract(box).png().toBuffer();
  return { png, ...box };
}

const report = [];
async function emitLogo(name, trimmed) {
  for (const [w, sfx] of [[1200, ""], [480, "-sm"]]) {
    const s = sharp(trimmed.png).resize({ width: w, kernel: "lanczos3" });
    const meta = await s.clone().png().toBuffer({ resolveWithObject: true });
    await s.clone().png({ compressionLevel: 9 }).toFile(path.join(BRAND, `${name}${sfx}.png`));
    await s.clone().webp({ quality: 92, alphaQuality: 100 }).toFile(path.join(BRAND, `${name}${sfx}.webp`));
    report.push(`${name}${sfx}: ${meta.info.width}x${meta.info.height}`);
  }
}

const colour = await loadTrimmed("logo_batinova_construction.png");
const mono = await loadTrimmed("logo_batinova_monochrome.png");
const onDark = await loadTrimmed("logo_batinova_monochrome.png", OFFWHITE); // derived from official monochrome logo
await emitLogo("batinova-logo", colour);
await emitLogo("batinova-logo-mono", mono);
await emitLogo("batinova-logo-ondark", onDark);

// ---- icon (roof mark) ----
const icon = await loadTrimmed("icone_batinova_minimaliste.png");
/** Square transparent canvas: mark scaled to `inner` px wide inside `size`, centred. */
async function squareIcon(size, innerRatio, bg) {
  const inner = Math.round(size * innerRatio);
  const mark = await sharp(icon.png).resize({ width: inner, kernel: "lanczos3" }).png().toBuffer();
  const mi = await sharp(mark).metadata();
  return sharp({ create: { width: size, height: size, channels: 4, background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: mark, left: Math.round((size - mi.width) / 2), top: Math.round((size - mi.height) / 2) }])
    .png({ compressionLevel: 9 });
}
// bbox + ~8% padding on each side => mark is ~86% of the canvas width
const small = {};
for (const s of [16, 32, 48]) {
  small[s] = await (await squareIcon(s, 0.86)).toBuffer();
  fs.writeFileSync(path.join(ICONS, `favicon-${s}.png`), small[s]);
}
// ICO container: header + directory + PNG payloads
const entries = [16, 32, 48];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(entries.length, 4);
const dir = Buffer.alloc(16 * entries.length);
let offset = 6 + dir.length;
entries.forEach((s, i) => {
  const o = i * 16;
  dir.writeUInt8(s, o);
  dir.writeUInt8(s, o + 1);
  dir.writeUInt8(0, o + 2);
  dir.writeUInt8(0, o + 3);
  dir.writeUInt16LE(1, o + 4);
  dir.writeUInt16LE(32, o + 6);
  dir.writeUInt32LE(small[s].length, o + 8);
  dir.writeUInt32LE(offset, o + 12);
  offset += small[s].length;
});
fs.writeFileSync(path.join(root, "src/app/favicon.ico"), Buffer.concat([header, dir, ...entries.map((s) => small[s])]));

await (await squareIcon(180, 0.78, { ...OFFWHITE, alpha: 1 })).toFile(path.join(root, "src/app/apple-icon.png"));
await (await squareIcon(192, 0.86)).toFile(path.join(ICONS, "icon-192.png"));
await (await squareIcon(512, 0.86)).toFile(path.join(ICONS, "icon-512.png"));
await (await squareIcon(512, 0.62, { ...OFFWHITE, alpha: 1 })).toFile(path.join(ICONS, "icon-maskable-512.png")); // inside the central 80% safe zone

// ---- Open Graph default (colour logo centred on off-white) ----
const ogLogo = await sharp(colour.png).resize({ width: 760, kernel: "lanczos3" }).png().toBuffer();
const om = await sharp(ogLogo).metadata();
await sharp({ create: { width: 1200, height: 630, channels: 3, background: OFFWHITE } })
  .composite([{ input: ogLogo, left: Math.round((1200 - om.width) / 2), top: Math.round((630 - om.height) / 2) }])
  .jpeg({ quality: 90, mozjpeg: true })
  .toFile(path.join(BRAND, "og-default.jpg"));

console.log(report.join("\n"));
for (const dirp of [BRAND, ICONS, path.join(root, "src/app")]) {
  for (const f of fs.readdirSync(dirp)) {
    if (/\.(png|webp|jpg|ico)$/.test(f)) console.log(`${path.relative(root, path.join(dirp, f))} ${fs.statSync(path.join(dirp, f)).size}B`);
  }
}
