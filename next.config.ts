import type { NextConfig } from "next";

/**
 * Owner: architect-security. Security headers for every route.
 *
 * CSP: static policy (no nonces) per the Next.js "Without Nonces" guide, so
 * pages can stay statically optimizable. 'unsafe-inline' for scripts is
 * required by Next's inline bootstrap without nonces; it is mitigated by:
 * no user-supplied HTML anywhere (Tiptap JSON rendered via React), strict
 * href validation, object-src 'none', base-uri/form-action 'self',
 * frame-ancestors 'none'. A nonce-based CSP (proxy.ts) is a documented
 * follow-up (forces dynamic rendering of all pages). No third-party origins are
 * allowed: analytics are disabled; enabling them later must extend this list.
 */
const isProd = process.env.NODE_ENV === "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProd ? "" : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "manifest-src 'self'",
  ...(isProd ? ["upgrade-insecure-requests"] : []),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ...(isProd ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }] : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // Native modules must not be bundled.
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2", "sharp", "nodemailer"],
  images: {
    // CMS media is served by our own route handler at /media/<key>.
    localPatterns: [{ pathname: "/media/**" }, { pathname: "/images/**" }],
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200, 1600, 2000],
    minimumCacheTTL: 2678400,
    dangerouslyAllowSVG: false,
  },
  experimental: {
    serverActions: {
      // Media uploads (15 MB) and lead attachments (4 x 4 MB) use Server Actions.
      bodySizeLimit: "20mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: securityHeaders },
      {
        source: "/admin/:path*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      { source: "/admin", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
};

export default nextConfig;
