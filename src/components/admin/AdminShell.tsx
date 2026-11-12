"use client";
// Responsive admin chrome (owner: cms-admin). Hiding links is cosmetic: every page/action re-checks the role.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { cx } from "./ui";

interface NavEntry {
  href: string;
  label: string;
  ownerOnly?: boolean;
}
const GROUPS: { title: string; items: NavEntry[] }[] = [
  { title: "", items: [{ href: "/admin", label: "Tableau de bord" }] },
  {
    title: "Contenu",
    items: [
      { href: "/admin/pages", label: "Pages" },
      { href: "/admin/pages?vue=services", label: "Services" },
      { href: "/admin/articles", label: "Articles" },
      { href: "/admin/taxonomie", label: "Catégories et étiquettes" },
      { href: "/admin/realisations", label: "Réalisations" },
      { href: "/admin/mediatheque", label: "Médiathèque" },
      { href: "/admin/navigation", label: "Navigation" },
    ],
  },
  { title: "Relation client", items: [{ href: "/admin/demandes", label: "Demandes de devis" }] },
  {
    title: "Site",
    items: [
      { href: "/admin/redirections", label: "Redirections" },
      { href: "/admin/corbeille", label: "Corbeille" },
      { href: "/admin/reglages", label: "Réglages", ownerOnly: true },
      { href: "/admin/utilisateurs", label: "Utilisateurs", ownerOnly: true },
    ],
  },
];

export function AdminShell({ user, logout, children }: { user: { name: string; role: "OWNER" | "EDITOR" }; logout: () => Promise<void>; children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) => {
    const base = href.split("?")[0]!;
    if (href.includes("vue=services")) return false;
    return base === "/admin" ? pathname === "/admin" : pathname.startsWith(base);
  };
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[17rem_1fr]">
      <a href="#contenu" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-3">
        Aller au contenu
      </a>
      <header className="flex items-center justify-between border-b border-charcoal/15 bg-charcoal px-4 py-3 text-offwhite lg:hidden">
        <span className="font-serif">BatiNova — Administration</span>
        <button type="button" aria-expanded={open} aria-controls="admin-nav" onClick={() => setOpen((o) => !o)} className="rounded-sm border border-offwhite/40 px-3 py-1 text-sm">
          {open ? "Fermer" : "Menu"}
        </button>
      </header>
      <aside id="admin-nav" className={cx("bg-charcoal text-offwhite lg:sticky lg:top-0 lg:block lg:h-screen lg:overflow-y-auto", open ? "block" : "hidden")}>
        <div className="hidden px-5 pb-2 pt-6 lg:block">
          <p className="font-serif text-lg">BatiNova</p>
          <p className="text-xs text-offwhite/60">Administration</p>
        </div>
        <nav aria-label="Administration" className="space-y-5 px-3 py-4">
          {GROUPS.map((g) => {
            const items = g.items.filter((i) => !i.ownerOnly || user.role === "OWNER");
            if (!items.length) return null;
            return (
              <div key={g.title || "root"}>
                {g.title ? <p className="px-2 pb-1 text-xs uppercase tracking-wider text-beige">{g.title}</p> : null}
                <ul>
                  {items.map((i) => (
                    <li key={i.href}>
                      <Link
                        href={i.href}
                        onClick={() => setOpen(false)}
                        aria-current={isActive(i.href) ? "page" : undefined}
                        className={cx("block rounded-sm px-2 py-1.5 text-sm hover:bg-white/10", isActive(i.href) && "bg-white/15 font-medium")}
                      >
                        {i.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-white/15 px-5 py-4 text-sm">
          <p>{user.name}</p>
          <p className="text-xs text-offwhite/60">{user.role === "OWNER" ? "Propriétaire" : "Éditeur"}</p>
          <form action={logout} className="mt-3">
            <button type="submit" className="underline underline-offset-4">
              Se déconnecter
            </button>
          </form>
        </div>
      </aside>
      <div id="contenu" className="min-w-0 px-4 py-6 sm:px-6">
        {children}
      </div>
    </div>
  );
}

export function PageHeader({ title, intro, actions }: { title: string; intro?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="max-w-2xl">
        <h1 className="font-serif text-2xl">{title}</h1>
        {intro ? <p className="mt-1 text-sm text-charcoal/70">{intro}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
