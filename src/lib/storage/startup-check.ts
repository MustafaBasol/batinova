import { storageDriverKind } from "./config";
import { verifyLocalStorage, type RecordStore } from "./persistence";
import { storageRoots } from "./roots";

const KEY = "system.storage";

/** Runs at production start (src/instrumentation.ts). Local driver only; S3 has no local state to lose. */
export async function assertStoragePersistence(): Promise<void> {
  if (storageDriverKind() !== "local") return;
  const { db } = await import("@/lib/db");
  const store: RecordStore = {
    async get() {
      const row = await db.setting.findUnique({ where: { key: KEY } });
      const v = row?.value as { mediaId?: unknown; privateId?: unknown } | null | undefined;
      return v && typeof v.mediaId === "string" && typeof v.privateId === "string" ? { mediaId: v.mediaId, privateId: v.privateId } : null;
    },
    async set(r) {
      await db.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: { ...r } }, update: { value: { ...r } } });
    },
  };
  await verifyLocalStorage(storageRoots(), store);
}
