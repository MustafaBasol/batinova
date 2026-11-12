/**
 * Pagination links (plain anchors, crawlable). <Pagination page pageCount hrefFor />  hrefFor(n) => URL.
 */
import Link from "next/link";

export function Pagination({ page, pageCount, hrefFor }: { page: number; pageCount: number; hrefFor: (n: number) => string }) {
  if (pageCount <= 1) return null;
  const nums = Array.from({ length: pageCount }, (_, i) => i + 1);
  return (
    <nav aria-label="Pagination" className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-charcoal/20 pt-8">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} rel="prev" className="arrow-link">
          <span aria-hidden="true">←</span> Précédent
        </Link>
      ) : (
        <span />
      )}
      <ul className="flex flex-wrap gap-2">
        {nums.map((n) => (
          <li key={n}>
            <Link
              href={hrefFor(n)}
              aria-current={n === page ? "page" : undefined}
              aria-label={`Page ${n}`}
              className={`grid min-h-11 min-w-11 place-items-center border px-3 text-sm no-underline ${n === page ? "border-charcoal bg-charcoal text-offwhite" : "border-charcoal/30 hover:border-charcoal"}`}
            >
              {n}
            </Link>
          </li>
        ))}
      </ul>
      {page < pageCount ? (
        <Link href={hrefFor(page + 1)} rel="next" className="arrow-link">
          Suivant <span aria-hidden="true">→</span>
        </Link>
      ) : (
        <span />
      )}
    </nav>
  );
}
