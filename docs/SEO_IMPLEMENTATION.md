# SEO implementation (seo-content, Phase 4)

SEO is product-wide: everything below works for CMS-created content (pages, posts, categories, projects), not only for seeded pages. All metadata, canonical, JSON-LD and robots signals are rendered **on the server** and verified in the actual HTML (see section 9). No SEO score or ranking is promised anywhere.

Official guidance followed: [Google Search Essentials](https://developers.google.com/search/docs/essentials), [Creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content), [Next.js metadata and OG images](https://nextjs.org/docs/app/getting-started/metadata-and-og-images).

## 1. Where things live
| Concern | File |
|---|---|
| Metadata builder (title/description/canonical/OG/Twitter/robots) | `src/lib/seo/metadata.ts` (`buildMetadata`, signature backward compatible) |
| Async wrapper injecting site defaults (settings.seo) | `src/lib/seo/server.ts` (`seoMetadata`, `ogFromMedia`) |
| Social image choice (smallest WebP variant >= 1200 px) | `src/lib/seo/media.ts` |
| JSON-LD builders (pure) + safe serializer | `src/lib/seo/jsonld.ts`, component `src/components/seo/JsonLd.tsx` |
| Sitemap data / route | `src/lib/seo/sitemap-data.ts`, `src/app/sitemap.ts` |
| robots | `src/app/robots.ts`, switch in `src/lib/seo/indexing.ts` |
| Redirects / 410 | `src/lib/seo/redirects.ts`, executed by `src/proxy.ts` |
| Listing rules (`?page=`, extra params) | `src/lib/seo/listing.ts` |
| Consent + analytics | `src/lib/seo/consent.ts`, `src/components/seo/{Analytics,ConsentBanner}.tsx`, mounted in `src/app/(site)/layout.tsx` |
| Page route metadata + JSON-LD (shared by `/` and catch-all) | `src/components/views/page-route.tsx` |

## 2. Metadata contract
- **Title**: `metaTitle || title`; a trailing brand suffix ("| BatiNova Construction", dash variants) is stripped so the root template `%s | BatiNova Construction` never doubles it. Home uses `title.absolute`. Guidance: keep the editable title around 60 characters or less *without* the brand (the brand adds about 23 characters). No hard limit is imposed on editors.
- **Description**: entity `metaDescription` -> `settings.seo.defaultMetaDescription` -> generated excerpt (first hero subheading / rich text, cut at a word boundary, about 160 characters).
- **Canonical**: absolute on `SITE_URL`, no trailing slash, home = `https://btnv.fr`. `canonicalPath` is honoured only if same-origin; a foreign origin falls back to `/`. Paginated lists are self-canonical (`/blog?page=2`); lists with any other query parameter canonicalise to the clean URL and are `noindex`.
- **Open Graph / Twitter**: `og:type` website or article (published/modified time, section, tags, author), `fr_FR`, site name, image = entity `ogImage` -> cover -> `settings.seo.defaultOgImageId` -> `/brand/og-default.jpg` (1200x630) with width/height/alt; `twitter:card=summary_large_image`.
- **Robots**: `index,follow` (+ `max-image-preview:large`) only when `SITE_INDEXING=true` AND not `noindex` AND not `isPlaceholder`. Otherwise `noindex,follow`. Tag archives: always `noindex,follow`. Empty blog/category pages and out-of-range pages: `noindex`. 404: `noindex`.
- **Placeholder pages are noindex by design** (services, legal, demo projects) until the owner confirms the copy and unticks "contenu de démonstration". They are also absent from the sitemap and carry no `Service` JSON-LD. Owner action: review each service page, then clear `isPlaceholder`, otherwise the service pages will never be indexed.
- **Search Console**: `settings.seo.googleSiteVerification` (token only) is output as `<meta name="google-site-verification">` from `src/app/(site)/layout.tsx`.

## 3. Sitemap and robots
- `/sitemap.xml` (request-time, so scheduled content appears without a rebuild): published + not deleted + not noindex + not placeholder + self-canonical pages; `/devis`; `/blog` (if at least one post); posts (with cover image in `<image:image>`); categories with at least one published post; `/realisations` and projects (none until real ones are published). `lastModified` = `updatedAt`. Never: `/admin`, `/devis/merci`, tag archives, drafts, future-scheduled, soft-deleted.
- Outside production the sitemap is empty and `robots.txt` is `Disallow: /`.
- Production `robots.txt`: `Allow: /`, `Disallow: /admin`, `/api/`, `/media/private`, `/devis/merci`; `Sitemap: https://btnv.fr/sitemap.xml`. Filtered/paginated variants are controlled with meta robots + canonical (not robots.txt) so crawlers can read the directive.

## 4. Structured data (JSON-LD, server-rendered)
| Page | Nodes |
|---|---|
| Home | `Organization` + `HomeAndConstructionBusiness`, `WebSite` |
| Any non-home page | `BreadcrumbList` (same builders as the visible breadcrumbs) |
| Post | `BreadcrumbList` + `BlogPosting` (headline, description, image from the cover/OG variant >= 1200 px, datePublished/dateModified, author, publisher with logo, section, keywords, wordCount) |
| Service page with `template=SERVICE` **and** `isPlaceholder=false` | `Service` (provider = organization, areaServed) |

Facts policy: only supplied/verified data. Address = the single head office supplied by the owner (not independently validated, flag `address.showOnSite` can hide it). `areaServed` = AdministrativeArea Île-de-France, Normandie, Manche (Manche `containedInPlace` Normandie), from `settings.serviceAreas`. `telephone`, `email`, `legalName` only when the settings field is `verified`. `sameAs` only for https social URLs entered by the owner. **Never emitted**: ratings, reviews, opening hours, founding date, geo coordinates, price range, branch offices. `HomeAndConstructionBusiness` is used instead of the narrower `GeneralContractor` until the owner confirms the exact activity. Author is the organization unless `authorDisplayName` looks like a person's name.

## 5. Redirects, 404, 410
- `src/proxy.ts` runs on the **Node.js runtime** (Next 16 default), so it reads the `Redirect` table directly: whole table cached 60 s in-process, chains collapsed to one hop, loops/long chains ignored (-> 404), protocol-relative and non-https targets rejected, hit counters batched and flushed asynchronously. Applies to GET/HEAD for every public URL, including slugs changed in the CMS (cms-admin creates the 301 automatically on slug change; see `src/lib/cms/redirects.ts`). The query string is preserved when the target has none.
- `410` returns a minimal French "Contenu supprimé" page with `X-Robots-Tag: noindex`.
- `www.<CANONICAL_HOST>` -> 301 to `https://<CANONICAL_HOST>` only when `CANONICAL_HOST` is set. Trailing slashes: Next's default 308 to the slash-less URL. Slugs are lower-case by rule (`src/lib/content/paths.ts`).
- A change made in /admin applies within about 60 s (cache TTL).
- Unknown URLs and non-public entities return a real 404 (French content, `noindex`).

## 6. Images
Alt text is required for rich-text images (schema), copied from the media library for covers/blocks; empty `alt=""` is only emitted when explicitly decorative. Test `tests/integration/seo-routes.test.ts` asserts that rendered rich text / blocks never output an `<img>` without `alt`. File naming: descriptive kebab-case French (see `assets/stock`). Covers feed `og:image` and the Article `image`. Stock photos are flagged `isPlaceholder` and credited.

## 7. Internal linking policy
1. Every service page links to the zone pages and to `/devis?type=<service>`; every zone page links to the services and to `/devis`. **Current state of the seeded pages (checked in `prisma/seed/pages.ts`)**: the CTA to `/devis` exists on every service and zone page and the home/services index link to the three services, but service pages do not link to zone pages and zone pages do not link to service pages. To be added by design-frontend/the owner in /admin (a "related" paragraph with links). Until then the three seeded articles are the only pages linking services and zones together.
2. Every article links to at least one `/services/...` page, at least one `/zones-intervention/...` page where relevant, `/devis`, and to 1-2 related articles. Related posts block: same category first, topped up with the latest posts.
3. Link text describes the destination ("Extension de maison : les questions à se poser"), never "cliquez ici".
4. Breadcrumbs on every non-home page (visible + JSON-LD). Do not link to draft/unpublished URLs from published content: seeded articles link to each other, so **publish the three seeded articles together**.
5. External links only to official or primary sources (service-public.fr, France Rénov'), `rel="noopener noreferrer"` added by the renderer.

## 8. Analytics and consent
Default: provider `none`, disabled => no script, no banner, no cookie. When the owner enables Plausible/GA4 in /admin with `requiresConsent` (GA4 always requires it), the script loads only after an explicit "Accepter"; the banner (Accepter / Refuser / Personnaliser, same visual weight, link to the privacy policy) appears only in that case, the choice is stored in the first-party cookie `btnv_consent` for about 6 months, and "Gérer mes cookies" lets visitors change it. Plausible without consent (`requiresConsent=false`) is the owner's legal decision: check the CNIL guidance for audience measurement exemptions before using it. The CSP in `next.config.ts` must be extended with the provider origins before enabling (see `docs/DEPLOYMENT.md` section 8). Privacy policy copy must name the provider.

## 9. How to verify (rendered HTML, not JS state)
```
npm run db:seed && SITE_INDEXING=true npm run dev -- -p 3400
curl -s localhost:3400/blog/<slug> | grep -oE '<title>[^<]*</title>|<link rel="canonical"[^>]*>|<meta (name|property)="(robots|description|og:[a-z:]+)"[^>]*>'
curl -s localhost:3400/blog/<slug> | grep -o 'application/ld+json'
curl -s -o /dev/null -w "%{http_code}\n" localhost:3400/does-not-exist        # 404
curl -s localhost:3400/robots.txt ; curl -s localhost:3400/sitemap.xml
npx vitest run tests/unit/seo-*.test.ts tests/integration/seo-*.test.ts
```
Post-deploy (owner / qa): `curl -I https://www.btnv.fr/` (301 to apex), `https://btnv.fr/robots.txt` shows the sitemap and no `Disallow: /`, Search Console property verified and sitemap submitted, URL Inspection on home + one article, [Rich Results Test](https://search.google.com/test/rich-results) and [Schema Markup Validator](https://validator.schema.org/) on home and an article, PageSpeed Insights / Core Web Vitals (field data only appears with real traffic).

## 10. Dashboards and editor checks (no score, no guarantee)
External: Google Search Console (Pages indexing, Sitemaps, Performance queries, Core Web Vitals, enhancements), Bing Webmaster Tools (optional), Rich Results Test, Schema Markup Validator, PageSpeed Insights / Lighthouse, Google Business Profile (owner-verified only, never created automatically).
In /admin (recommended editor checks, informative only, no numeric "SEO score"): character counters for title/description with guidance rather than hard limits; media alt required; slug rule + automatic 301 on slug change; noindex and canonical fields; placeholder flag reminder; warning when a published page has no meta description (falls back to the site default); list of redirects with hit counters (`/admin/redirections`).

## 11. Keyword research method (no measured volumes asserted)
Volumes are not stated anywhere in this repository. To size opportunities use Google Search Console (real queries once indexed), Google Keyword Planner (needs an Ads account), Google Trends and the autocomplete / "People also ask" suggestions, then record the tool and date next to any number. Until then every target query in `docs/EDITORIAL_PLAN.md` is a **hypothesis** about search intent. Topics only cover **confirmed services** (rénovation, extension, construction) and the confirmed zones (Île-de-France, Normandie, dont la Manche).

Blog taxonomy (slugs): `conseils-renovation`, `construction`, `budget-travaux`, `demarches`, `realisations`. `realisations` stays empty (and out of the sitemap) until real, owner-verified projects exist.

## 12. Location pages: anti-doorway policy
Core pages: `/zones-intervention/ile-de-france`, `/zones-intervention/normandie`, `/zones-intervention/manche`. The company has **one** office (Aulnay-sous-Bois); no local branch, map pin or address is ever shown for other places.

A new zone/location page may be created only if ALL are true:
- [ ] the owner confirms in writing that the company really serves that area (service coverage verified);
- [ ] the page contains region-specific, useful information that the existing zone pages do not (typical building stock, local constraints the team has actually dealt with, how site logistics are organised from Aulnay-sous-Bois), written by or validated with someone who knows the area;
- [ ] at least one real, owner-verified project photo or case study from that area (no stock image presented as a project) or another form of proof the owner can substantiate;
- [ ] its content differs materially from sibling pages (not the same text with another place name; reviewer test: swap the place name, the page must stop making sense);
- [ ] it links to the relevant confirmed services and the quote form, and is linked from its parent zone page;
- [ ] no invented address, branch, phone, map, opening hours, review or rating.

Never: generating pages per commune/department from a list, "rénovation + <ville>" templates, keyword-stuffed city lists, fake local branches, duplicated paragraphs. Departments or cities other than the three core areas are mentioned in running text only when a real project there exists and the owner approves.
