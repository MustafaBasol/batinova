import path from "node:path";

/** Resolved local storage roots (owner: architect-security). Throws on nested or /public roots. */
export function storageRoots(): { pub: string; priv: string } {
  const pub = path.resolve(/*turbopackIgnore: true*/ process.env.MEDIA_STORAGE_DIR || "./storage/media");
  const priv = path.resolve(/*turbopackIgnore: true*/ process.env.PRIVATE_STORAGE_DIR || "./storage/private");
  const inside = (a: string, b: string) => {
    const rel = path.relative(b, a);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };
  if (inside(pub, priv) || inside(priv, pub)) {
    throw new Error("MEDIA_STORAGE_DIR and PRIVATE_STORAGE_DIR must be separate, non-nested directories.");
  }
  if (inside(priv, path.resolve(/*turbopackIgnore: true*/ "public")) || inside(pub, path.resolve(/*turbopackIgnore: true*/ "public"))) {
    throw new Error("Storage directories must not live inside /public.");
  }
  return { pub, priv };
}
