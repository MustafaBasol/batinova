import "server-only";
import { createHmac } from "node:crypto";
import { isIP } from "node:net";
import { serverEnv } from "@/lib/config/env";

/**
 * Client IP handling (owner: architect-security).
 * Raw IPs are never persisted: only HMAC-SHA256(IP_HASH_SECRET, ip).
 * X-Forwarded-For / X-Real-IP (or CLIENT_IP_HEADER) are trusted only when TRUST_PROXY=true (i.e. the
 * app is behind a reverse proxy that overwrites them; TRUST_PROXY_HOPS = number of proxies appending to X-Forwarded-For); otherwise all clients
 * share the "unknown" bucket for IP-based limits (email limits still apply).
 */
const IP_HEADERS = new Set(["x-real-ip", "cf-connecting-ip", "true-client-ip", "x-client-ip"]);

/** Number of trusted proxies that append to X-Forwarded-For (TRUST_PROXY_HOPS, 1..5, default 1). */
export function trustedHops(raw: string | undefined = process.env.TRUST_PROXY_HOPS): number {
  const n = Number(raw ?? "1");
  return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 1;
}

export function getClientIp(headers: Headers): string {
  if (serverEnv().TRUST_PROXY === "true") {
    // Optional single-value header set by YOUR edge proxy/CDN (CLIENT_IP_HEADER, allow-listed). Use it only when the
    // edge overwrites it and the app is reachable only through that edge.
    const named = process.env.CLIENT_IP_HEADER?.trim().toLowerCase();
    if (named && IP_HEADERS.has(named)) {
      const ip = normalizeIp(headers.get(named)?.trim());
      if (ip) return ip;
      return "unknown";
    }
    // Every proxy APPENDS the address it saw to any client-supplied X-Forwarded-For, so the LEFT side is
    // attacker-controlled. With N trusted hops the client address is the Nth entry from the RIGHT.
    const xff = headers.get("x-forwarded-for");
    if (xff) {
      const parts = xff.split(",").map((x) => x.trim());
      const ip = normalizeIp(parts[parts.length - trustedHops()]);
      if (ip) return ip;
      return "unknown"; // fewer entries than trusted hops: the request did not come through the expected proxies
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
