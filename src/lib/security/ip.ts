import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { serverEnv } from "@/lib/config/env";

/**
 * Client IP handling (owner: architect-security).
 * Raw IPs are never persisted: only HMAC-SHA256(IP_HASH_SECRET, ip).
 * X-Forwarded-For / X-Real-IP are trusted only when TRUST_PROXY=true (i.e. the
 * app is behind a reverse proxy that overwrites them); otherwise all clients
 * share the "unknown" bucket for IP-based limits (email limits still apply).
 */
export function getClientIp(headers: Headers): string {
  if (serverEnv().TRUST_PROXY === "true") {
    // A proxy APPENDS the address it saw to any client-supplied X-Forwarded-For, so the
    // LEFTMOST entry is attacker-controlled (rate-limit evasion by rotating fake IPs).
    // The RIGHTMOST entry is the one added by our own proxy and is the one to trust.
    const xff = headers.get("x-forwarded-for");
    if (xff) {
      const last = xff.split(",").pop()?.trim();
      const ip = normalizeIp(last);
      if (ip) return ip;
    }
    const ip = normalizeIp(headers.get("x-real-ip")?.trim());
    if (ip) return ip;
  }
  return "unknown";
}

/** Accepts only syntactically valid IPv4/IPv6 literals (strips an IPv4 port); otherwise null. */
function normalizeIp(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let v = raw.trim();
  const withPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d{1,5}$/.exec(v);
  if (withPort) v = withPort[1]!;
  v = v.replace(/^\[(.*)\]$/, "$1");
  return isIP(v) ? v.toLowerCase() : null;
}

export function hashIp(ip: string): string {
  return createHmac("sha256", serverEnv().IP_HASH_SECRET).update(`ip:${ip}`).digest("hex").slice(0, 32);
}

/** Keyed hash for other identifiers used as rate-limit keys (e.g. e-mail). */
export function hashIdentifier(kind: string, value: string): string {
  return createHmac("sha256", serverEnv().IP_HASH_SECRET)
    .update(`${kind}:${value.trim().toLowerCase()}`)
    .digest("hex")
    .slice(0, 32);
}

export function truncateUserAgent(ua: string | null | undefined): string | null {
  if (!ua) return null;
  return ua.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200);
}
