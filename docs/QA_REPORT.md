# BatiNova — QA / release-gate report (Phase 5)

Date of run: 2026-11-12. Branch `feature/batinova-initial-development`. Nothing was deployed, pushed or opened as a PR.
Only results actually produced by the commands below are reported; anything not run is marked NOT RUN / NOT MEASURED.

## 1. Verdict

Code-level: READY_FOR_PR after the fixes listed in section 4 (they are uncommitted in the working tree; the coordinator commits).
Owner-content blockers (legal identity, placeholders, phone, SMTP, DNS…) are expected and listed in `docs/OWNER_CHECKLIST.md`.
They block going live, not the PR.

## 2. Exact commands and results (run one at a time, final run)

| Command | Result |
|---|---|
| `npm run typecheck` | PASS (exit 0) |
| `npm run lint` | PASS (exit 0; `.tmp/**` added to ESLint ignores) |
| `npm test` (Vitest, 2 workers) | PASS: 17 files, 229 tests (228 existing + 1 new redirect-cache test) |
| `npm run build` | PASS (exit 0). All routes dynamic except icons/manifest |
| `npm run test:e2e` (Playwright 1.65, Chromium headless shell, production build on port 3500) | PASS: 92 tests, 1 worker, about 2.5 min plus about 45 s server boot |
| `npm audit --omit=dev` | 0 vulnerabilities |

E2E harness: `playwright.config.ts` + `tests/e2e/start-server.mjs` (Playwright `webServer.command`). It wipes and recreates `.tmp/e2e`
(gitignored), runs `prisma migrate deploy` on an empty SQLite file, runs the seed, creates OWNER / EDITOR / lockout users with random
passwords generated at runtime (written to `.tmp/e2e/creds.json`, never committed), then starts `next start -p 3500` with
`NODE_ENV=production`, `SITE_URL=https://btnv.fr`, `SITE_INDEXING=true`, `TRUST_PROXY=true` (so each test uses its own
`X-Forwarded-For` and therefore its own rate-limit bucket). Run `npm run build` first.
No production default was weakened and no new env flag was needed: Chromium treats `http://localhost` as a secure context, so the
`__Host-`/Secure session cookie and `upgrade-insecure-requests` work over plain http on localhost.
This also proves "fresh install boot": empty DB -> migrations -> seed -> create admins -> start (it does not cover `npm ci`, which was not run).

Spec files: `tests/e2e/public.spec.ts`, `a11y.spec.ts`, `quote.spec.ts`, `admin.spec.ts`, `seo.spec.ts` (+ `helpers.ts`).

## 3. Matrix

| Area | Check | Method | Result | Evidence |
|---|---|---|---|---|
| Mobile | 17 public pages at 360 px and 1280 px: HTTP 200, `lang=fr`, exactly one H1, one `<main>`, no horizontal overflow | Playwright | PASS (after fix 1) | `public.spec.ts` (34 tests). Before the fix every page overflowed to 458 px |
| Mobile | Quote flow on 390 px touch viewport | Playwright | PASS | `quote.spec.ts` |
| Keyboard | Mobile menu: Enter opens, focus inside, Tab and Shift+Tab trapped (25 presses each), Esc closes, focus returns to the button, scroll lock released; link click closes menu | Playwright | PASS | `public.spec.ts` |
| Keyboard | Skip link is first focusable and visible | Playwright | PASS | `public.spec.ts` |
| WCAG | axe `wcag2a/wcag2aa/wcag21a/wcag21aa` on home, service, zone, /devis, /blog, /contact, /mentions-legales, 404; mobile and desktop | @axe-core/playwright | PASS (after fix 2) | `a11y.spec.ts` (16 tests). Real finding fixed: callout title contrast 4.06:1. Other contrast hits were entrance-animation artefacts, so the test waits for finite animations |
| WCAG | Manual screen-reader pass, zoom/reflow, reduced-motion visual check | n/a | NOT RUN | Automated axe covers only part of WCAG |
| Reduced motion | `prefers-reduced-motion` block exists in `globals.css` | code read | PASS (not visually tested) | `src/app/globals.css` |
| Links | Same-origin crawl from `/` + sitemap (about 20 pages), all `a[href]` and `<img src>`: all 200 | Playwright (APIRequest) | PASS | `seo.spec.ts` crawl test. No link to a draft/unpublished post or to a missing page |
| 404 | Status 404 + noindex for unknown page/post/project/category/tag; French 404 page, `lang=fr`, H1, home link after hydration | Playwright | PASS with caveat | See risk R1 (the raw server HTML is Next's error shell without `lang`) |
| French copy | `lang=fr`, French labels/errors on all flows exercised | Playwright | PASS (spot checks, no copy audit) | all specs |
| Quote | Per-step validation, consent required, success screen, lead visible in /admin inbox, no PII in URL | Playwright | PASS | `quote.spec.ts` |
| Quote | Honeypot: success screen shown, lead NOT stored | Playwright | PASS | `quote.spec.ts` |
| Quote | Rate limit: 4th lead with the same e-mail gets "Trop de demandes envoyées" | Playwright | PASS | `quote.spec.ts`; IP limit (5/h) and 3 s minimum fill time covered by existing Vitest `leads.test.ts` |
| Admin auth | Anonymous GET of 6 admin URLs -> redirect to login; anonymous upload/export POST refused | Playwright | PASS | `admin.spec.ts` |
| Admin auth | Login `next=` open-redirect payloads (`//evil`, `https://evil`, `/\evil`, `/admin/../evil`, `javascript:`) end on the same origin under `/admin` | Playwright | PASS | `admin.spec.ts` |
| Admin auth | Session cookie `__Host-btnv_session`: HttpOnly, Secure, SameSite=Lax, Path=/ , opaque value | Playwright | PASS | `admin.spec.ts` |
| Admin auth | Brute force: 5 wrong passwords lock the account (right password then refused), further attempts get "Trop de tentatives" | Playwright | PASS | `admin.spec.ts` |
| RBAC | EDITOR denied `/admin/utilisateurs`, `/admin/reglages` (server redirect to `/admin?refus=1`) and OWNER-only CSV export (403); OWNER allowed | Playwright | PASS | `admin.spec.ts` |
| RBAC | Every Server Action / route handler: role check before any DB write, zod validation, no IDOR | code read of all 4 `_actions/*.ts` files (30 actions), 5 route handlers, `devis/actions.ts`, `auth/actions.ts` | PASS | See section 5 |
| Editor | Tiptap: type, bold, H2, link, cover image, save | Playwright | PASS after fixes 3 and 4 | Both were real bugs, see section 4 |
| Publication | Draft -> public 404, not in /blog or sitemap | Playwright | PASS | `admin.spec.ts` |
| Preview | Admin preview 200 + `X-Robots-Tag: noindex`; anonymous preview redirected/denied and title not leaked | Playwright | PASS | `admin.spec.ts` |
| Publication | Publish -> 200, rich text rendered as `<strong>`, `<h2>`, `<a href>`, in /blog and sitemap; unpublish -> 404 and removed from sitemap | Playwright | PASS | `admin.spec.ts` |
| Scheduled | SCHEDULED visible only after `scheduledAt` | Vitest (existing) | PASS (not in E2E) | `tests/integration/content.test.ts`, `seo-sitemap-robots.test.ts` |
| Revisions / slugs | Slug change after publication -> old URL 301 to new URL immediately (cache invalidated); trash then restore | Playwright | PASS (after fix 5) | `admin.spec.ts`; Vitest `seo-redirects-db.test.ts` (new test) |
| Revisions | Revision list / restore | Vitest (existing) | PASS (no E2E) | `admin-actions.test.ts` |
| Redirects | Admin-created 301 and 410 served (410 has `lang=fr` + noindex); loop, `javascript:` and `//evil.example` destinations refused | Playwright | PASS | `seo.spec.ts` |
| Media | Real JPEG accepted (201), re-encoded, EXIF dropped, served as raster with nosniff, no 2400w variant for a 1200 px source (no upscaling) | Playwright | PASS | `admin.spec.ts`; `withoutEnlargement: true` in `src/lib/media/pipeline.ts` |
| Media | SVG, HTML, PHP, GIF, empty, truncated JPEG, all named `.jpg`: 4xx; script payload appended to a JPEG does not survive re-encode; cross/missing Origin 403; body over 15 MB 413 (size gate before buffering) | Playwright | PASS | `admin.spec.ts` |
| Privacy | Private attachments unreachable through `/media` (`leads/` keys, `..%2f` traversal, svg/html keys -> 404) | Playwright | PASS | `admin.spec.ts`; attachment download only via authenticated route |
| Sitemap | Only published, indexable (not placeholder, not noindex), canonical-origin, `?`-free URLs, each answers 200; seeded drafts absent | Playwright + DB read | PASS | `seo.spec.ts` |
| Robots | Allow `/`, Disallow `/admin`, Sitemap line `https://btnv.fr/sitemap.xml`; `SITE_INDEXING` unset = `Disallow: /` | Playwright + code | PASS | `seo.spec.ts`, `src/app/robots.ts` |
| Canonical / OG | Home, service, zone, contact: title (<=75), description (<=170), canonical = `https://btnv.fr<path>`, og:url/title/description/locale `fr_FR`/site_name/image absolute, twitter:card | Playwright | PASS (after fix 6: Manche title/description were too long) | `seo.spec.ts` |
| Indexing gate | Placeholder pages (home, services, legal…) are noindex even with `SITE_INDEXING=true` | Playwright + DB | PASS | `seo.spec.ts`. Consequence: site stays noindex until the owner clears the flags |
| JSON-LD | Valid JSON; no rating/review/telephone/priceRange/foundingDate/geo/offers/opening hours; one address = 4 rue des Lilas, 93600 Aulnay-sous-Bois, FR; `areaServed` only Île-de-France, Normandie, Manche; no `Service` node while service copy is placeholder; BlogPosting headline equals post title | Playwright | PASS | `seo.spec.ts`. `serializeJsonLd` escapes `< > & U+2028/9` (unit tests existing) |
| Content integrity | Visible copy of all crawled pages scanned for phone numbers, SIREN/SIRET/TVA/RCS values, décennale, years of experience, ratings/testimonials/"avis", certification claims, prices | Playwright regex | PASS (0 hits) | `seo.spec.ts`. Regex scan only; names of clients/projects cannot be regex-checked, review manually |
| Content integrity | 3 seeded articles: no prices, durations, décennale, RGE, testimonials; all DRAFT | DB read | PASS | `seo.spec.ts` |
| Placeholders | « Contenu de démonstration » shown on services; legal pages show `[À compléter par le propriétaire]` and noindex; address formatted `4 rue des Lilas` / `93600 Aulnay-sous-Bois` | Playwright | PASS | `seo.spec.ts`. NOTE: nothing technically blocks a production deploy while placeholders remain (see R4) |
| Internal linking | Service pages link to all 3 zone pages and zone pages link to all 3 services | Playwright | PASS (after fix 6) | `seo.spec.ts`; applies to freshly seeded DBs only |
| Privacy defaults | Home + /devis: zero third-party requests, no cookie, no localStorage/sessionStorage, no consent banner; CSP has no analytics origin | Playwright | PASS | `seo.spec.ts` |
| Security headers | CSP (incl. `upgrade-insecure-requests`, `frame-ancestors 'none'`), nosniff, X-Frame-Options DENY, Referrer-Policy, HSTS, Permissions-Policy, COOP; no `x-powered-by`; admin `no-store` | Playwright (response headers) | PASS | `seo.spec.ts` |
| Secrets | `.env` gitignored, only `.env.example` tracked; `git grep` for key/token/private-key patterns | shell | PASS (no hits; test-only dummy secrets in `vitest.config.ts`) | |
| XSS | No `dangerouslySetInnerHTML` except `JsonLd.tsx` | grep | PASS | `src/components/seo/JsonLd.tsx` |
| Performance | Home hero `<img>` eager + `fetchPriority="high"`, explicit width/height, `sizes` on `<source>`; below-the-fold images lazy; fonts self-hosted with `font-display: swap` | Playwright (HTML/CSS) | PASS | `seo.spec.ts` |
| Performance | Tiptap / ProseMirror / dnd-kit absent from every public route chunk (only in one admin chunk) | `.next` manifests + chunk grep | PASS | `server/app/**/page_client-reference-manifest.js` |
| Performance | First-load JS (all `<script src>` of the HTML): `/` 9 files, 593 KB raw, 183 KB gzip; `/devis` 11 files, 717 KB raw, 220 KB gzip | curl + gzip on built chunks | MEASURED (no budget defined) | |
| Performance | Font preload hints (`<link rel=preload as=font>`) | HTML | NOT EMITTED | R3 |
| Performance | Lighthouse / Web Vitals / real-device throttling | n/a | NOT MEASURED | Lighthouse CLI not installed; no scores reported |
| Browsers | Chromium only | n/a | Firefox/WebKit NOT RUN | |
| Fresh install | `npm ci` from scratch | n/a | NOT RUN (installs forbidden) | Migration + seed + admin bootstrap + `next start` from an empty DB: PASS |
| Email | Real SMTP delivery | n/a | NOT RUN | Mail disabled by design until the owner configures SMTP; leads are stored regardless |

## 4. Fixes made in this phase

1. Mobile header overflowed on every page at 360 px: the quote button used `hidden` but the unlayered `.btn { display:inline-flex }` beat it.
   Fixed in `src/components/site/SiteNav.tsx` (wrapper hides it) and `src/app/globals.css` (`.btn.hidden { display:none }`).
   The same bug showed the quote form's "Envoyer ma demande" button on every step.
2. Callout title contrast 4.06:1 -> about 5.4:1 (`.rt-callout-title` in `src/app/globals.css`).
3. Editor dialogs (link, image, media-picker search) were `<form>`s nested inside the editor's own `<form>`. Submitting
   them reloaded the page and lost the unsaved draft. Replaced by non-form groups with `type="button"` + Enter handling:
   `src/components/admin/editor/RichTextEditor.tsx`, `src/components/admin/MediaPicker.tsx`.
4. Saving ANY article containing a paragraph/heading failed with "attrs invalides": ProseMirror attrs are null-prototype objects,
   React encodes them as `"$T"` temporary references when calling a Server Action. Fixed with a JSON round-trip in
   `RichTextEditor.tsx` (`onUpdate`). Vitest could not see this (it calls the library directly); only E2E did.
5. Redirect cache: moved to `globalThis` (proxy and Server Actions are different bundles) and invalidated from
   `src/lib/cms/redirects.ts` (`recordMove`, `clearRedirectFrom`) and the redirect Server Actions in
   `src/app/admin/(panel)/_actions/content.ts`. A slug change now redirects immediately instead of after up to 60 s.
   New Vitest test in `tests/integration/seo-redirects-db.test.ts`.
6. Seed content (create-if-missing, existing dev DBs are not updated): service <-> zone cross-links added to `prisma/seed/pages.ts`;
   Manche meta title/description shortened.
7. CSP: `next.config.ts` now adds analytics origins only when `CSP_ANALYTICS_PROVIDER` (`plausible` | `ga4`) is set at BUILD time.
   Default = no third-party origin. Documented in `.env.example`.
8. `eslint.config.mjs` ignores `.tmp/**`. `package.json`: script `test:e2e`.

Verified, no change needed: media pipeline uses `withoutEnlargement` (a 1200 px upload yields no variant above 1200 px;
the stock images are already 2400 px wide sources).

## 5. Security review notes (read of the code)

- All 30 admin Server Actions start with `requireRole("EDITOR"|"OWNER")` before any DB access; mutations go through lib functions with zod
  (`parseOrThrow`) and audit. The 5 admin route handlers use `requireRole(..., {mode:"throw"})`; mutating ones add `assertSameOrigin`.
  Every admin `page.tsx` calls `requireRole`/`requireUser` itself (layout and proxy are only defence in depth).
- Resource access: lead attachment route checks `attachmentId` belongs to `id` and the lead is not deleted; media/redirect/user IDs are re-resolved server side.
- Login `next` is whitelisted by regex (`/admin...` only). Redirect table targets: internal path or `https://` URL; `//host`, `javascript:` refused.
- Upload: content-length gate (413 over 15 MB + 256 KB framing, 411 if unknown) before `formData()`, magic-byte sniff, sharp re-encode with pixel limit.
- Public `/media/<key>` serves raster types only, hides soft-deleted media, fails closed, CSP `default-src 'none'; sandbox`.

## 6. Remaining risks (ordered)

- R1 (medium, platform): with Next 16.4.6 any `notFound()` is answered 404 with Next's minimal error shell
  (`<html id="__next_error__">`, empty body, no `lang`); the French 404 page is rendered client-side after hydration (verified in a
  browser: `lang=fr`, content, axe clean). Status 404 and noindex are correct. A no-JS client sees a blank page. Reproduced with a trivial page,
  with the default `not-found`, and without `proxy.ts`, so it is not caused by project code. Mitigation options: accept, or serve 404s from a custom handler later.
- R2 (medium, ops): `TRUST_PROXY=false` puts every visitor in one IP bucket: 5 quote requests/hour and 20 login attempts/15 min for the whole site.
  Production must set `TRUST_PROXY=true` behind a proxy that overwrites `X-Forwarded-For` (in the owner checklist).
- R3 (low): no font preload hints; LCP text may flash with the fallback font (`swap`, size-adjusted fallbacks exist). Not measured.
- R4 (medium, process): no automatic production guard stops deployment while legal pages still contain `[À compléter par le propriétaire]`.
  The safeguards are: visible placeholders, noindex on legal and placeholder pages, `SITE_INDEXING` off by default, Organization JSON-LD without unverified identity.
  The owner checklist is the gate.
- R5 (low): redirect destinations may be any `https://` URL for EDITOR accounts (open redirect creatable by a compromised editor). 410 is OWNER-only.
- R6 (low): Server Actions accept bodies up to 20 MB (including unauthenticated quote/login actions); the quote form itself caps at 4 files x 4 MB and attachments are disabled by default.
- R7 (low): `Ctrl+B` did not toggle bold in one automated attempt (toolbar button works); not investigated.
- R8: E2E runs Chromium only; no Lighthouse numbers; axe is not a full WCAG audit; no real SMTP test; `npm ci` not exercised.
