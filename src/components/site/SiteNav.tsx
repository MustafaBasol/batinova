"use client";
/**
 * Header navigation (client island for current-page state and the mobile menu).
 * Desktop links are always in the server-rendered HTML (SEO). Mobile menu: button with aria-expanded,
 * modal dialog, focus moved inside + trapped, Esc closes and restores focus, body scroll locked,
 * closes on navigation.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import type { LogoOverrides } from "./brand-assets";

export interface NavLinkItem {
  id: string;
  label: string;
  href: string;
  openInNewTab?: boolean;
  children?: NavLinkItem[];
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function isCurrent(pathname: string, href: string) {
  if (/^https?:|^mailto:|^tel:|^#/.test(href)) return false;
  const h = href.split("#")[0]!.split("?")[0]!;
  if (h === "/") return pathname === "/";
  return pathname === h || pathname.startsWith(`${h}/`);
}

export function SiteNav({ items, ctaHref, ctaLabel, logos }: { items: NavLinkItem[]; ctaHref: string; ctaLabel: string; logos?: LogoOverrides }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prevPath, setPrevPath] = useState(pathname);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setOpen(false);
  }

  const close = useCallback(() => {
    setOpen(false);
    buttonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const first = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const f = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (f.length === 0) return;
      const firstEl = f[0]!;
      const lastEl = f[f.length - 1]!;
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  return (
    <>
      {/* Desktop */}
      <nav aria-label="Navigation principale" className="hidden min-[1180px]:block">
        <ul className="flex items-center gap-x-6 min-[1360px]:gap-x-8 min-[1440px]:gap-x-10">
          {items.map((it) => (
            <li key={it.id} className="nav-item">
              <Link
                href={it.href}
                className="nav-link"
                aria-current={isCurrent(pathname, it.href) ? "page" : undefined}
                {...(it.openInNewTab ? { target: "_blank", rel: "noopener noreferrer" } : {})}
              >
                {it.label}
              </Link>
              {it.children && it.children.length > 0 && (
                <ul className="nav-sub">
                  {it.children.map((c) => (
                    <li key={c.id}>
                      <Link href={c.href} aria-current={isCurrent(pathname, c.href) ? "page" : undefined}>
                        {c.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      </nav>

      {/* Wrapper hides the CTA on mobile: the unlayered `.btn { display: inline-flex }` would beat a `hidden` utility on the link itself. */}
      <div className="hidden min-[1180px]:block">
        <Link href={ctaHref} className="btn btn-primary">
          {ctaLabel}
        </Link>
      </div>

      {/* Mobile */}
      <button
        ref={buttonRef}
        type="button"
        className="-mr-2 inline-flex min-h-12 min-w-12 items-center justify-center gap-3 px-2 text-[0.8125rem] font-medium uppercase tracking-[0.14em] min-[1180px]:hidden"
        aria-expanded={open}
        aria-controls="menu-mobile"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <span>Menu</span>
        <span aria-hidden="true" className="flex w-6 flex-col gap-[6px]">
          <span className="block h-px bg-current" />
          <span className="block h-px w-4 self-end bg-current" />
        </span>
      </button>

      {open && (
        <div id="menu-mobile" ref={panelRef} className="mobile-panel on-dark" role="dialog" aria-modal="true" aria-label="Menu principal">
          <div className="wrap flex h-[4.5rem] flex-none items-center justify-between">
            <Link href="/" aria-label="BatiNova Construction — accueil" onClick={() => setOpen(false)}>
              <Logo variant="onDark" overrides={logos} className="w-[9.25rem]" />
            </Link>
            <button
              type="button"
              onClick={close}
              className="-mr-2 inline-flex min-h-12 min-w-12 items-center justify-center gap-3 px-2 text-[0.8125rem] font-medium uppercase tracking-[0.14em]"
            >
              <span>Fermer</span>
              <span aria-hidden="true" className="text-xl leading-none">
                ×
              </span>
            </button>
          </div>
          <nav aria-label="Navigation mobile" className="wrap flex-1 py-6">
            <ul>
              {items.map((it) => (
                <li key={it.id} className="card-line">
                  <Link
                    href={it.href}
                    className="display block py-4 text-[2rem] leading-tight"
                    aria-current={isCurrent(pathname, it.href) ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {it.label}
                  </Link>
                  {it.children && it.children.length > 0 && (
                    <ul className="-mt-1 mb-3 ml-1 space-y-1">
                      {it.children.map((c) => (
                        <li key={c.id}>
                          <Link href={c.href} className="block py-2 text-base text-offwhite/85" onClick={() => setOpen(false)}>
                            {c.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </nav>
          <div className="wrap flex-none pb-8">
            <Link href={ctaHref} className="btn btn-beige w-full" onClick={() => setOpen(false)}>
              {ctaLabel}
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
