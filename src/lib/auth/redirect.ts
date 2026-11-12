/**
 * Post-login destination guard (owner: architect-security). Only same-site /admin paths are
 * accepted; everything else (absolute URLs, //host, backslashes, encoded tricks, the login page
 * itself) falls back to /admin. Pure and isomorphic.
 */
export function safeNext(next: string | undefined | null): string {
  if (!next) return "/admin";
  if (!/^\/admin(?:\/[A-Za-z0-9\-_/]*)?(?:\?[A-Za-z0-9\-_=&]*)?$/.test(next)) return "/admin";
  if (next.startsWith("/admin/login")) return "/admin";
  if (next.includes("//")) return "/admin";
  return next;
}
