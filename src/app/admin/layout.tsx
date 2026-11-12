// Admin root layout. Owner: cms-admin (created by architect-security).
// MUST keep: robots noindex metadata and dynamic rendering. Authorization is NOT
// done here (the login page lives below it) — see (panel)/layout.tsx and the
// guards in src/lib/auth/guards.ts, which every admin page/action must call.
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: { default: "Administration", template: "%s — Administration BatiNova" },
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-dynamic";

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-offwhite text-charcoal">{children}</div>;
}
