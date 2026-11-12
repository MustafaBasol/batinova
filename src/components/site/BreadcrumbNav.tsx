/**
 * Visible breadcrumb trail. <Breadcrumbs items={Crumb[]} tone? />  (items built with ./breadcrumbs.ts).
 * Renders nothing for a single item (home). Last item is aria-current="page".
 */
import Link from "next/link";
import type { Crumb } from "./breadcrumbs";

export function Breadcrumbs({ items, tone = "light" }: { items: Crumb[]; tone?: "light" | "dark" }) {
  if (items.length < 2) return null;
  return (
    <nav aria-label="Fil d’Ariane" className={tone === "dark" ? "on-dark" : ""}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8125rem] tracking-wide">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={c.path} className="flex items-center gap-2">
              {last ? (
                <span aria-current="page" className={tone === "dark" ? "text-offwhite" : "text-charcoal"}>
                  {c.name}
                </span>
              ) : (
                <>
                  <Link href={c.path} className={`link-line ${tone === "dark" ? "text-offwhite/85" : "text-bronze"}`}>
                    {c.name}
                  </Link>
                  <span aria-hidden="true" className={tone === "dark" ? "text-beige" : "text-bronze/60"}>
                    /
                  </span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
