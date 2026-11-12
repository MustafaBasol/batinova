import "server-only";
import { createHmac } from "node:crypto";
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
    const xff = headers.get("x-forwarded-for");
    if (xff) {
      const first = xff.split(",")[0]?.trim();
      if (first) return first.slice(0, 64);
    }
    const real = headers.get("x-real-ip");
    if (real) return real.trim().slice(0, 64);
  }
  return "unknown";
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
