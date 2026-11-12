import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { S3Driver } from "@/lib/storage/s3";
import { s3ConfigFromEnv, s3Problems, storageDriverKind } from "@/lib/storage/config";
import { startFakeS3, type FakeS3 } from "../support/fake-s3";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
let s3: FakeS3;
beforeAll(async () => {
  s3 = await startFakeS3();
});
afterAll(async () => s3.close());

const cfg = () => ({
  endpoint: s3.endpoint,
  region: "us-east-1",
  bucket: "test-bucket",
  accessKeyId: "TESTKEY",
  secretAccessKey: "TESTSECRET",
  forcePathStyle: true,
  prefix: "",
});

describe("S3Driver (in-memory S3, no real provider)", () => {
  it("round-trips an object under the media/ prefix", async () => {
    const d = new S3Driver(cfg(), "media");
    expect(await d.put("2026/11/abc.png", PNG, "image/png")).toEqual({ key: "2026/11/abc.png", size: PNG.length });
    expect(s3.objects.has("test-bucket/media/2026/11/abc.png")).toBe(true);
    expect(await d.exists("2026/11/abc.png")).toBe(true);
    expect((await d.read("2026/11/abc.png"))?.equals(Buffer.from(PNG))).toBe(true);
    const s = await d.getStream("2026/11/abc.png");
    expect(s?.size).toBe(PNG.length);
    const buf = Buffer.from(await new Response(s!.stream).arrayBuffer());
    expect(buf.equals(Buffer.from(PNG))).toBe(true);
    await d.delete("2026/11/abc.png");
    expect(await d.exists("2026/11/abc.png")).toBe(false);
    expect(await d.read("2026/11/abc.png")).toBeNull();
    expect(await d.getStream("2026/11/abc.png")).toBeNull();
    await d.delete("2026/11/abc.png"); // idempotent
  });

  it("isolates public (media/) and private (private/) scopes", async () => {
    const pub = new S3Driver(cfg(), "media");
    const priv = new S3Driver(cfg(), "private");
    await priv.put("leads/2026/11/0123456789abcdef01234567.png", PNG, "image/png");
    expect(await pub.exists("leads/2026/11/0123456789abcdef01234567.png")).toBe(false);
    expect([...s3.objects.keys()].some((k) => k.startsWith("test-bucket/private/"))).toBe(true);
  });

  it("honours an optional prefix", async () => {
    const d = new S3Driver({ ...cfg(), prefix: "batinova" }, "media");
    await d.put("2026/11/p.png", PNG, "image/png");
    expect(s3.objects.has("test-bucket/batinova/media/2026/11/p.png")).toBe(true);
  });

  it.each(["../x.png", "2026/../../x.png", "/etc/passwd", "A/B.PNG", "2026//x.png", ""])("rejects invalid key %j before any request", async (key) => {
    const d = new S3Driver(cfg(), "media");
    const before = s3.objects.size;
    await expect(d.put(key, PNG, "image/png")).rejects.toThrow();
    await expect(d.getStream(key)).rejects.toThrow();
    await expect(d.delete(key)).rejects.toThrow();
    expect(s3.objects.size).toBe(before);
  });
});

describe("S3 configuration", () => {
  it("defaults to the local driver", () => {
    expect(storageDriverKind({})).toBe("local");
    expect(storageDriverKind({ STORAGE_DRIVER: "s3" })).toBe("s3");
  });
  it("requires bucket and credentials, https endpoint, and never echoes values", () => {
    const p = s3Problems({ STORAGE_DRIVER: "s3", S3_ENDPOINT: "http://x.example", S3_SECRET_ACCESS_KEY: "topsecretvalue" }).join(" ");
    expect(p).toMatch(/S3_BUCKET/);
    expect(p).toMatch(/S3_ACCESS_KEY_ID/);
    expect(p).toMatch(/https/);
    expect(p).not.toContain("topsecretvalue");
    expect(() => s3ConfigFromEnv({ STORAGE_DRIVER: "s3" })).toThrow(/S3_BUCKET/);
    expect(s3ConfigFromEnv({ S3_BUCKET: "b", S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_ENDPOINT: "https://s3.example.net", S3_PREFIX: "/bati/" })).toMatchObject({ bucket: "b", prefix: "bati", region: "auto" });
  });
});
