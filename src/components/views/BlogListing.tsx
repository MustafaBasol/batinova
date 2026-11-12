/**
 * Blog listing layout shared by /blog, category and tag pages (server).
 * <BlogListing eyebrow? title intro? crumbs categories activeCategory? items page pageCount hrefFor />
 */
import Link from "next/link";
import { Breadcrumbs } from "@/components/site/BreadcrumbNav";
import type { Crumb } from "@/components/site/breadcrumbs";
import { categoryUrl } from "@/lib/content/paths";
import { PostCard, type PostCardData } from "./Cards";
import { Pagination } from "./Pagination";

const chip = (active: boolean) =>
  `inline-block border px-4 py-2 text-sm no-underline ${active ? "border-charcoal bg-charcoal text-offwhite" : "border-charcoal/30 hover:border-charcoal"}`;

export function BlogListing({
  eyebrow = "Blog",
  title,
  intro,
  crumbs,
  categories,
  activeCategory,
  items,
  page,
  pageCount,
  hrefFor,
}: {
  eyebrow?: string;
  title: string;
  intro?: string | null;
  crumbs: Crumb[];
  categories: { slug: string; name: string; postCount: number }[];
  activeCategory?: string;
  items: PostCardData[];
  page: number;
  pageCount: number;
  hrefFor: (n: number) => string;
}) {
  const [first, ...rest] = items;
  const feature = page === 1 && items.length >= 3 ? first : undefined;
  const grid = feature ? rest : items;
  return (
    <>
      <div className="wrap pt-6">
        <Breadcrumbs items={crumbs} />
      </div>
      <header className="wrap pb-10 pt-10 sm:pt-14 lg:pt-20">
        <p className="eyebrow rise">{eyebrow}</p>
        <h1 className="display h-page rise rise-2 mt-5 max-w-4xl">{title}</h1>
        {intro && <p className="lead rise rise-3 mt-6">{intro}</p>}
        {categories.length > 0 && (
          <nav aria-label="Catégories du blog" className="mt-10">
            <ul className="flex flex-wrap gap-2">
              <li>
                <Link href="/blog" aria-current={!activeCategory ? "page" : undefined} className={chip(!activeCategory)}>
                  Tous les articles
                </Link>
              </li>
              {categories.map((c) => (
                <li key={c.slug}>
                  <Link href={categoryUrl(c.slug)} aria-current={activeCategory === c.slug ? "page" : undefined} className={chip(activeCategory === c.slug)}>
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </header>
      <section className="wrap pb-20 lg:pb-32" aria-label="Articles">
        {items.length === 0 ? (
          <div className="border border-charcoal/20 bg-white p-8 sm:p-12">
            <h2 className="display h-section">Les premiers articles arrivent bientôt.</h2>
            <p className="lead mt-4">
              Nous préparons des contenus utiles pour bien aborder un projet de rénovation, d’extension ou de construction. En attendant, parlez-nous du vôtre.
            </p>
            <Link href="/devis" className="btn btn-primary mt-8">
              Demander un devis
            </Link>
          </div>
        ) : (
          <div className="grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:grid-cols-3">
            {feature && <PostCard post={feature} featured />}
            {grid.map((p) => (
              <PostCard key={p.slug} post={p} />
            ))}
          </div>
        )}
        <Pagination page={page} pageCount={pageCount} hrefFor={hrefFor} />
      </section>
    </>
  );
}
