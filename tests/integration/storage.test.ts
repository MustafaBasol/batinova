import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  LocalDiskDriver,
  generateStorageKey,
  getPrivateStorage,
  getPublicStorage,
  isValidStorageKey,
  sanitizeOriginalName,
} from "@/lib/storage";
import { sniffMime } from "@/lib/storage/mime";
import { GET } from "@/app/media/[...key]/route";

const root = mkdtempSync(path.join(tmpdir(), "btnv-storage-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

describe("LocalDiskDriver", () => {
  const driver = new LocalDiskDriver(path.join(root, "media"));

  it("round-trips an object", async () => {
    await driver.put("2026/11/abc.png", PNG, "image/png");
    expect(await driver.exists("2026/11/abc.png")).toBe(true);
    expect((await driver.read("2026/11/abc.png"))?.equals(Buffer.from(PNG))).toBe(true);
    const s = await driver.getStream("2026/11/abc.png");
    expect(s?.size).toBe(PNG.length);
    await s?.stream.cancel();
    await driver.delete("2026/11/abc.png");
    expect(await driver.exists("2026/11/abc.png")).toBe(false);
  });

  it.each([
    "../secret.png",
    "2026/../../secret.png",
    "..",
    "/etc/passwd",
    "C:/Windows/win.ini",
    "a\\..\\b.png",
    "2026/11/.hidden",
    "2026//x.png",
    "%2e%2e/x.png",
    "A/B.PNG",
    "",
  ])("rejects traversal / invalid key %j", async (key) => {
    expect(isValidStorageKey(key)).toBe(false);
    await expect(driver.put(key, PNG, "image/png")).rejects.toThrow();
    await expect(driver.getStream(key)).rejects.toThrow();
  });

  it("generates valid random keys and sanitizes names", () => {
    const k = generateStorageKey("WEBP", { now: new Date("2026-11-12T00:00:00Z") });
    expect(k).toMatch(/^2026\/11\/[0-9a-f]{24}\.webp$/);
    expect(isValidStorageKey(k)).toBe(true);
    expect(() => generateStorageKey("../x")).toThrow();
    expect(sanitizeOriginalName("..\\..\\C:/evil/<script>.jpg")).toBe("script.jpg");
  });

  it("sniffs magic bytes instead of trusting extensions", () => {
    expect(sniffMime(PNG)).toBe("image/png");
    expect(sniffMime(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffMime(new TextEncoder().encode("%PDF-1.7"))).toBe("application/pdf");
  });
});

describe("public vs private storage isolation", () => {
  it("uses separate roots and /media never serves private files", async () => {
    const pub = getPublicStorage() as LocalDiskDriver;
    const priv = getPrivateStorage() as LocalDiskDriver;
    expect(pub.root).not.toBe(priv.root);

    // A private attachment under the same key must not be reachable via /media.
    const key = "leads/2026/11/0123456789abcdef01234567.png";
    await priv.put(key, PNG, "image/png");
    const params = (k: string) => ({ params: Promise.resolve({ key: k.split("/") }) });
    const res = await GET(new Request("https://btnv.fr/media/" + key), params(key));
    expect(res.status).toBe(404);

    // Traversal from the public root into the private root is rejected.
    const rel = path.relative(pub.root, path.join(priv.root, key)).split(path.sep).join("/");
    const res2 = await GET(new Request("https://btnv.fr/media/x"), params(rel));
    expect(res2.status).toBe(404);

    // The same file in public storage is served with safe headers.
    await pub.put("2026/11/0123456789abcdef01234567.png", PNG, "image/png");
    const ok = await GET(new Request("https://btnv.fr/media/x"), params("2026/11/0123456789abcdef01234567.png"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect(ok.headers.get("x-content-type-options")).toBe("nosniff");
    expect(ok.headers.get("content-disposition")).toBe("inline");
    await ok.body?.cancel();
  });

  it("refuses non-raster types even in public storage", async () => {
    const pub = getPublicStorage() as LocalDiskDriver;
    writeFileSync(path.join(pub.root, "evil.html"), "<script>alert(1)</script>");
    await pub.put("2026/11/doc.pdf", new TextEncoder().encode("%PDF-1.7"), "application/pdf");
    const res = await GET(new Request("https://btnv.fr/media/x"), { params: Promise.resolve({ key: ["evil.html"] }) });
    expect(res.status).toBe(404);
    const pdf = await GET(new Request("https://btnv.fr/media/x"), { params: Promise.resolve({ key: ["2026", "11", "doc.pdf"] }) });
    expect(pdf.status).toBe(404);
  });
});
