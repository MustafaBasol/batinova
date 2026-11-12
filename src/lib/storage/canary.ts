import { createHash, randomBytes } from "node:crypto";
import type { StorageDriver } from "./driver";

/**
 * Deployment persistence canary (owner: architect-security). Works with BOTH drivers and needs no shell: it is
 * driven by the token-protected route /api/maintenance/storage-canary (or the tests). Test data only — a 1x1 PNG per scope.
 *
 * What it proves, in order of strength:
 *   - the app user can write / read / delete / recreate objects in the public AND private storage;
 *   - objects written BEFORE a restart / redeployment are still there AFTER it (`check`), while `cwdHash`
 *     (a hash of the deployment folder) shows that the code really ran from a different release folder;
 *   - public and private storage are separate: the private canary is NOT reachable through the public driver.
 * The list of canaries lives in the database (Setting `system.canary`), so a wiped directory is detected as `missing`.
 */
export const CANARY_SETTING = "system.canary";
const MAX_ENTRIES = 20;

// 1x1 transparent PNG (valid raster, so GET /media/<key> can serve the public canary).
export const CANARY_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

export interface CanaryEntry {
  id: string;
  at: string;
  cwdHash: string;
  bootedAt: string;
}

export interface CanaryStore {
  get(): Promise<CanaryEntry[]>;
  set(entries: CanaryEntry[]): Promise<void>;
}

export interface StorageDriverPair {
  pub: StorageDriver;
  priv: StorageDriver;
}

export interface CanaryEnv extends StorageDriverPair {
  store: CanaryStore;
  cwdHash: string;
  bootedAt: Date;
  now?: Date;
}

export const publicKey = (id: string) => `canary/${id}.png`;
export const privateKey = (id: string) => `canary/${id}-p.png`;

export function cwdHashOf(cwd: string = process.cwd()): string {
  return createHash("sha256").update(cwd).digest("hex").slice(0, 8);
}

async function same(d: StorageDriver, key: string): Promise<boolean> {
  const b = await d.read(key);
  return !!b && b.equals(CANARY_PNG);
}

export async function writeCanary(env: CanaryEnv) {
  const id = randomBytes(8).toString("hex");
  await env.pub.put(publicKey(id), CANARY_PNG, "image/png");
  await env.priv.put(privateKey(id), CANARY_PNG, "image/png");
  if (!(await same(env.pub, publicKey(id))) || !(await same(env.priv, privateKey(id)))) throw new Error("canary read-back failed");
  const entry: CanaryEntry = { id, at: (env.now ?? new Date()).toISOString(), cwdHash: env.cwdHash, bootedAt: env.bootedAt.toISOString() };
  const entries = [...(await env.store.get()), entry].slice(-MAX_ENTRIES);
  await env.store.set(entries);
  return { entry, publicPath: `/media/${publicKey(id)}`, privateProbePath: `/media/${privateKey(id)}` };
}

export async function checkCanary(env: CanaryEnv) {
  const entries = await env.store.get();
  const now = (env.now ?? new Date()).getTime();
  const results = [];
  for (const e of entries) {
    const pubOk = await same(env.pub, publicKey(e.id));
    const privOk = await same(env.priv, privateKey(e.id));
    results.push({
      id: e.id,
      ageSeconds: Math.round((now - Date.parse(e.at)) / 1000),
      writtenByDeployment: e.cwdHash,
      survivedRedeploy: e.cwdHash !== env.cwdHash,
      survivedRestart: Date.parse(e.bootedAt) < env.bootedAt.getTime() - 1000,
      publicPresent: pubOk,
      privatePresent: privOk,
    });
  }
  const deployments = new Set([...entries.map((e) => e.cwdHash), env.cwdHash]).size;
  return {
    currentDeployment: env.cwdHash,
    processBootedAt: env.bootedAt.toISOString(),
    distinctDeploymentsSeen: deployments,
    canaries: results,
    ok: results.length > 0 && results.every((r) => r.publicPresent && r.privatePresent),
    // "2 redeployments survived" = canaries written by >= 2 DIFFERENT earlier deployments still present, plus this one.
    twoRedeploysProven: results.length > 0 && results.every((r) => r.publicPresent && r.privatePresent) && deployments >= 3,
  };
}

/** Write -> read -> delete -> verify gone -> recreate -> read -> delete, on both scopes, plus the scope boundary. */
export async function cycleCanary(env: CanaryEnv) {
  const id = `cycle${randomBytes(6).toString("hex")}`;
  const out: Record<string, boolean> = {};
  for (const [label, d, key] of [["public", env.pub, publicKey(id)], ["private", env.priv, privateKey(id)]] as const) {
    await d.put(key, CANARY_PNG, "image/png");
    out[`${label}Write`] = await same(d, key);
    await d.delete(key);
    out[`${label}Delete`] = !(await d.exists(key));
    await d.put(key, CANARY_PNG, "image/png");
    out[`${label}Recreate`] = await same(d, key);
    await d.delete(key);
  }
  // Boundary: a private object must not exist in the public scope under the same key.
  await env.priv.put(privateKey(id), CANARY_PNG, "image/png");
  out.privateNotInPublicScope = !(await env.pub.exists(privateKey(id)));
  await env.priv.delete(privateKey(id));
  return { ok: Object.values(out).every(Boolean), checks: out };
}

export async function cleanupCanary(env: CanaryEnv) {
  const entries = await env.store.get();
  for (const e of entries) {
    await env.pub.delete(publicKey(e.id)).catch(() => undefined);
    await env.priv.delete(privateKey(e.id)).catch(() => undefined);
  }
  await env.store.set([]);
  return { removed: entries.length };
}
