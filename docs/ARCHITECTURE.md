# BatiNova — Architecture & shared contracts (Phase 1)

Owner: `architect-security`. Contracts marked **FROZEN** may only change additively
(new optional fields, new block types, new functions). Anything else requires a
coordinator decision and a new Prisma migration.

## 1. Stack (exact pinned versions)

| Concern | Choice |
|---|---|
| Runtime | Node 24 (>= 24), npm 11 |
| Framework | Next.js 16.4.6 App Router, React 19.3.1, TypeScript 6.0.3 (strict, `noUncheckedIndexedAccess`) |
| Styling | Tailwind CSS 4.3.5 (`@tailwindcss/postcss`), tokens in `src/app/globals.css` `@theme` |
| DB / ORM | MySQL (Hostinger) + Prisma 7.10.1 (`prisma-client` generator → `src/generated/prisma`, gitignored) with `@prisma/adapter-mariadb` 7.10.1 (`mariadb` driver) |
| Validation | zod 4.6.7 |
| Passwords | `@node-rs/argon2` 2.2.2 (Argon2id, m=19 MiB, t=2, p=1) |
| Images | sharp 0.35.5 (dependency only; upload pipeline = cms-admin) |
| Mail | nodemailer 10.5.0 (lazy-loaded, disabled by default) |
| Tests | Vitest 5.1.0 (`maxWorkers: 2`, `fileParallelism: false`, isolated `prisma/test-vitest.db`) |
| Lint | ESLint 9.39.5 + eslint-config-next 16.4.6 (flat config). ESLint 10 not used: several Next plugins do not yet declare ESLint 10 support. TypeScript 7 (native) not used: typescript-eslint supports `<6.1`. |

Why MySQL + Prisma (decision 002, see docs/DEPLOYMENT.md): Hostinger Business provides managed MySQL and its Node.js deployments overwrite the release folders, so state must live in the database/persistent storage;
Prisma 7's driver adapter installs cleanly on Windows. PostgreSQL path: `docs/DEPLOYMENT.md`.

## 2. Directory map & FILE OWNERSHIP

| Path | Owner |
|---|---|
| `prisma/schema.prisma`, `prisma/migrations/**`, `prisma.config.ts` | architect-security (shared — changes coordinated, new migration each time) |
| `prisma/seed/index.ts`, `client.ts`, `settings.ts` | architect-security |
| `prisma/seed/pages.ts`, `navigation.ts`, `projects.ts` | design-frontend |
| `prisma/seed/blog.ts` | seo-content |
| `src/lib/config/*`, `src/lib/db.ts`, `src/lib/auth/**`, `src/lib/security/**`, `src/lib/storage/**`, `src/lib/mail/**`, `src/lib/leads/**`, `src/lib/settings*.ts`, `src/lib/blocks/schema.ts`, `src/lib/richtext/schema.ts`, `src/lib/content/{publish,paths,public}.ts` | architect-security (FROZEN contracts) |
| `src/lib/seo/metadata.ts` | seo-content (stub created here; keep signature) |
| `src/proxy.ts` | architect-security (seo-content may add DB redirects after coordination) |
| `next.config.ts`, `src/app/layout.tsx`, `src/app/globals.css` tokens | architect-security (design-frontend may add fonts/body classes and CSS below the marker) |
| `src/app/(site)/**` | design-frontend (seo-content adds `sitemap.ts`, `robots.ts`, JSON-LD in coordination) |
| `src/app/admin/login/**`, `src/lib/auth/actions.ts` | architect-security (cms-admin may restyle markup only) |
| `src/app/admin/layout.tsx`, `src/app/admin/(panel)/**` | cms-admin (must keep guards + noindex) |
| `src/app/media/[...key]/route.ts` | architect-security |
| `scripts/*`, `vitest.config.ts`, `tests/support/**` | architect-security |
| `tests/**` (new files) | each agent adds its own test files |

Agents add new helpers in new files (e.g. `src/lib/media/pipeline.ts`, `src/components/**`)
rather than editing frozen files.

## 3. Configuration — `src/lib/config/site.ts` (isomorphic)

`SITE_URL` (env `SITE_URL`, default `https://btnv.fr`, origin only), `SITE` (name, slogan
« Construire autrement. », locale `fr-FR`, `ogLocale fr_FR`, `htmlLang fr`, timezone
`Europe/Paris`), `BASE_ADDRESS` (4 rue des Lilas, 93600 Aulnay-sous-Bois — `source:
"user-supplied"`, `verified:false`), `SERVICE_AREAS` (Île-de-France, Normandie, Manche
[department of Normandie, highlighted] — **single head office, no branches**),
`REGION_LABELS`, `absoluteUrl(path)`. Server env: `serverEnv()` in `src/lib/config/env.ts`
(lazy zod validation, reports variable names only).

## 4. Database — `src/lib/db.ts`

`import { db } from "@/lib/db"` (server only). Types: `import type { Page } from "@/generated/prisma/client"`.

Models: User, Session, RateLimitBucket, AuditLog, Media, Page, PageRevision, Category, Tag,
Post, PostTag, PostRevision, Project, ProjectMedia, ProjectRevision, Lead, LeadAttachment,
NavItem, Setting, Redirect. Enums: Role, ContentStatus, PageTemplate, Region,
ProjectMediaRole, LicenseType, LeadStatus, MailDeliveryState, AttachmentKind, NavLocation.

Key conventions:
- **Soft delete** ("corbeille"): `deletedAt`/`deletedById` on Page, Post, Project, Media,
  Category, Tag. Delete = set `deletedAt`; restore = set it back to null. Unique slugs/paths
  stay reserved while in the trash (admin must offer restore or permanent delete).
  Hard delete is OWNER-only.
- `isPlaceholder` on Page/Post/Project/Media → public UI must show « Contenu de démonstration ».
- SEO fields on Page/Post/Project/Category: `metaTitle`, `metaDescription`, `ogImageId`, `noindex`, `canonicalPath`.
- Revisions: on each admin save, insert `{Page|Post|Project}Revision.snapshot` (full JSON of editable fields).
- `Post.body` = Tiptap JSON (§7). `Page.blocks`/`Project.blocks`/`Post.blocks` = `CmsBlock[]` (§6).
- Media focal point `focalX/focalY` (0..1) + optional `crop` JSON; `variants` JSON list.
- Redirect.statusCode ∈ {301,302,308,410} (validated in app); `toPath` null only for 410.

## 5. Publication rule — `src/lib/content/publish.ts` (FROZEN)

```ts
publishedWhere(now?: Date)        // Prisma where: deletedAt null AND (PUBLISHED & publishedAt<=now|null OR SCHEDULED & scheduledAt<=now)
isPubliclyVisible(row, now?)      // same rule in memory
effectivePublishedAt(row)         // publishedAt ?? scheduledAt
notDeleted                         // { deletedAt: null } for Media/Category/Tag
```
Scheduled items become public at request time (no cron) — public routes that list content
must be dynamic or use short `revalidate`.

### Paths — `src/lib/content/paths.ts` (FROZEN)
Home page `Page.path === ""` (served at `/`; there is no "accueil" path). Other paths:
1–4 lower-case slug segments, no leading slash; first segment not in `RESERVED_SEGMENTS`
(admin, api, media, blog, realisations, …). URL builders: `pageUrl`, `postUrl` (`/blog/<slug>`),
`blogIndexUrl`, `categoryUrl` (`/blog/categorie/<slug>`), `tagUrl` (`/blog/etiquette/<slug>`),
`projectUrl` (`/realisations/<slug>`), `mediaUrl(storageKey)`. Helpers: `isValidSlug`,
`isValidPagePath`, `toPagePath(params)`, `slugify`. Services = Pages with template `SERVICE`
under `services/…`; zones = template `ZONE` under `zones-intervention/…`.

## 6. Public query layer — `src/lib/content/public.ts` (FROZEN signatures)

All results exclude drafts, archived, future, and soft-deleted rows; admin fields are not selected.
```ts
getPublishedPageByPath(path: string): Promise<PublicPage | null>      // blocks parsed, hidden parent removed
listPublishedPages(): Promise<{path,title,template,noindex,updatedAt,isPlaceholder}[]>
listNavPages(): Promise<{path,title,label,href}[]>                    // fallback to Page.showInNav
listNavItems(location: "HEADER"|"FOOTER_PRIMARY"|"FOOTER_LEGAL"): Promise<PublicNavItem[]>  // tree, 1 level
listPublishedPosts({page?, perPage?, categorySlug?, tagSlug?}): Promise<{items,total,page,pageCount}>
getPublishedPostBySlug(slug): Promise<PublicPost | null>             // body = validated Tiptap doc
listCategories(): Promise<{slug,name,description,postCount}[]>
getCategoryBySlug(slug), getTagBySlug(slug)
listPublishedProjects({region?, limit?}): Promise<PublicProjectListItem[]>
getPublishedProjectBySlug(slug): Promise<PublicProject | null>       // media ordered, deleted media removed
getMediaById(id), getMediaByIds(ids): Promise<Map<id, PublicMedia>>
getSettings(): Promise<SiteSettings>
```
`PublicMedia` includes `storageKey, mime, width, height, alt, caption, credit, licenseType,
licenseSource, isPlaceholder, focalX, focalY, variants`. Image URL = `mediaUrl(storageKey)`.

### Navigation model
`NavItem(location HEADER|FOOTER_PRIMARY|FOOTER_LEGAL, label, href?, pageId?, parentId?,
sortOrder, openInNewTab, enabled)`. Prefer `pageId` links: the item disappears automatically
when the page is not public. Free `href` is re-validated with `isSafeHref` on read. If a
location has no items, the frontend may fall back to `listNavPages()`.

## 7. Content formats

### CMS blocks — `src/lib/blocks/schema.ts` (FROZEN)
`BlockSchema` = zod discriminated union on `type`; `BlocksSchema` (strict array, ≤60, for
saving); `parseBlocks(input) → { blocks, dropped[{index,type,reason}] }` (lenient, for
rendering); `BLOCK_TYPES` (French label/description/defaults); `collectMediaIds(blocks)`.
Types `CmsBlock`, `CmsBlockType`, `BlockOf<T>`, `HeroBlockData` …

| type | fields |
|---|---|
| hero | eyebrow?, heading, subheading?, imageId?, ctaLabel?, ctaHref? (required with label) |
| richText | doc (Tiptap JSON, §7.2) |
| image | mediaId, caption? |
| gallery | heading?, mediaIds[1..40] |
| ctaBand | heading, text?, label, href |
| features / steps | heading?, items[1..12]{title, text} |
| faq | heading?, items[1..30]{question, answer} |
| projectsGrid | heading?, limit(1..24, def 6), region? |
| postsGrid | heading?, limit(1..24, def 3), categorySlug? |
| zones | heading?, intro? |
| contactForm | heading?, source? (lead source tag) |
| placeholderNotice | text |

All blocks accept optional `id` (editor key/anchor). Non-rich text fields are **plain text**
(render with line breaks; no Markdown, no HTML). hrefs: `isSafeHref` (relative `/…`, `#anchor`,
`https:`, `mailto:`, `tel:`) — `javascript:`, `data:`, `http:`, `//host` rejected.

### Rich text — `src/lib/richtext/schema.ts` (FROZEN)
Whitelisted Tiptap JSON. Nodes: doc, paragraph, heading (level 2–4), text, hardBreak,
bulletList, orderedList(start), listItem, blockquote, horizontalRule,
callout(variant retenir|info|attention), image(mediaId, alt **required**, caption?,
size small|medium|full), table/tableRow/tableHeader/tableCell(colspan, rowspan, colwidth).
Marks: bold, italic, underline, strike, subscript, superscript, link(href, nofollow,
target _blank|_self), textStyle(fontSize sm|base|lg|xl, color charcoal|graphite|bronze),
highlight(color beige|sand|offwhite). `textAlign` left|center|right|justify on
paragraph/heading. Unknown nodes/marks/attrs, `style`, `on*`, image `src`, unsafe link
schemes → rejected. Link `rel`/`class` from Tiptap are ignored (renderer recomputes with
`linkRel()`). Limits: depth 12, 20k nodes, 200k chars.

API: `validateRichText(x) → {ok:true, doc} | {ok:false, errors[{path,message}]}` (call
before every save and store the normalized `doc`), `RichTextDocSchema` (zod transform),
`parseRichText(x)` (lenient → `emptyDoc()` on invalid), `emptyDoc()`,
`richTextToPlainText`, `richTextExcerpt(doc, max)`, `countWords`, `estimateReadingMinutes`,
`collectRichTextMediaIds`, `linkRel`, presets `FONT_SIZES`, `TEXT_COLORS`,
`HIGHLIGHT_COLORS`, `IMAGE_SIZES`, `CALLOUT_VARIANTS`. Renderer (design-frontend): map nodes
to React elements + preset classes, never `dangerouslySetInnerHTML`. Editor (cms-admin):
configure Tiptap with exactly these extensions; custom `image` node with `mediaId`.

## 8. Settings — `src/lib/settings.ts` / `settings-schema.ts`

Keys: `company` (legalName, tradeName, legalForm, siren, siret, rcs, tvaNumber, capital,
director, phone, publicEmail, hostingProvider, insurance, privacyController — each
`{value:"", verified:false}`), `address` (user-supplied base), `serviceAreas`, `emailRouting`
(contact/devis/projets/direction/privacy @btnv.fr, each `provisioned:false`;
`leadNotificationTarget:"devis"`), `social` (all ""), `leads` (`retentionDays:1095`,
`retentionConfirmed:false`, `spamRetentionDays:30`, `consentTextVersion`, `attachmentsEnabled:false`),
`mail` (`enabled:false`), `seo` (`googleSiteVerification:""`, `defaultOgImageId`,
`defaultMetaDescription`), `analytics` (`provider:"none"`, `id:""`, `enabled:false`,
`requiresConsent:true`).
API: `getSettings()`, `getSetting(key)`, `updateSetting(key, value, actorId)` (validates +
audits; **caller authorizes**, see `SETTING_EDIT_ROLES`: company/address/emailRouting/leads/
mail/analytics = OWNER), `defaultSettings()`, `isVerified(field)` (public UI shows a company
value only when true), `analyticsAllowed(settings.analytics, hasConsent)` (GA4 always
requires consent; nothing loads by default; CSP must be extended before enabling).

## 9. Auth & authorization — `src/lib/auth/`

- `password.ts`: `hashPassword`, `verifyPassword`, `passwordPolicyError` (min 12).
- `session.ts`: 32-byte random token in cookie; DB stores `HMAC-SHA256(SESSION_SECRET, token)`.
  Cookie `__Host-btnv_session` (prod; Secure) / `btnv_session` (dev); httpOnly, SameSite=Lax,
  Path=/. Idle timeout 4 h, absolute 7 days. `createSession`, `validateSessionToken`,
  `revokeSessionToken`, `revokeAllUserSessions` (call on password/role change, deactivation), `pruneExpiredSessions`.
- `login.ts`: `attemptLogin` — per-IP-hash 20/15 min, per-email-hash 10/15 min, account lock
  after 5 consecutive failures (15 min doubling, cap 24 h), dummy Argon2 verify for unknown
  e-mails, one generic French error, audit entries, session rotation.
- `guards.ts` (**use in every admin page, Server Action and Route Handler**):
  ```ts
  getCurrentUser(): Promise<SessionUser | null>
  requireUser(opts?: { mode?: "redirect" | "throw" }): Promise<SessionUser>
  requireRole(role: "OWNER" | "EDITOR", opts?): Promise<SessionUser>  // OWNER > EDITOR
  hasRole(user, role), assertRole(user, role)
  AuthError(status 401|403), authErrorResponse(err)  // for route handlers
  ```
  Redirect mode: unauthenticated → `/admin/login`; insufficient role → `/admin?refus=1`.
- `actions.ts` ("use server"): `loginAction(prev, formData)`, `logoutAction()`.
- `src/proxy.ts`: UX redirect for `/admin*` without a cookie + `X-Robots-Tag`. **Not** a security boundary.

RBAC policy (cms-admin implements): EDITOR — create/edit/publish pages, posts, projects,
media, categories/tags, nav, soft-delete/restore content, read leads & change lead status.
OWNER — everything plus users, company/legal settings, email routing, mail switch,
analytics, lead export/hard delete/purge, permanent deletes, redirects 410.

## 10. Security helpers — `src/lib/security/`

`rateLimit(key, limit, windowMs, now?) → {allowed, count, remaining, retryAfterMs}` (DB fixed
window; one atomic INSERT … ON DUPLICATE KEY UPDATE under the row lock, concurrency covered by tests), `resetRateLimit`,
`pruneRateLimitBuckets`; `getClientIp(headers)` (reads forwarding headers only if
`TRUST_PROXY=true`; uses the RIGHTMOST X-Forwarded-For entry = the one appended by our proxy,
because the leftmost is client-controlled; non-IP values are ignored; otherwise the shared
`unknown` bucket), `hashIp(ip)` / `hashIdentifier(kind, v)` (HMAC
with `IP_HASH_SECRET`), `truncateUserAgent`; `assertSameOrigin(request)` / `isSameOrigin` —
**required in mutating Route Handlers**; Server Actions are origin-checked by Next.js already;
`audit(actorId, action, {type,id}?, summary?)` — action names `entity.verb`, summary stripped of
PII-like keys; `isSafeHref(href, {allowHttp?})`, `isSafeInternalPath(path)`.

Every admin mutation: `const user = await requireRole(...)` → zod-validate input → write →
`audit(user.id, "page.publish", { type: "Page", id })`.

## 11. Storage — `src/lib/storage/`

```ts
interface StorageDriver { put(key, data, mime); getStream(key) → {stream,size}|null; read(key); delete(key); exists(key) }
getPublicStorage()   // MEDIA_STORAGE_DIR   (default ./storage/media)  → served by GET /media/<key>
getPrivateStorage()  // PRIVATE_STORAGE_DIR (default ./storage/private) → NEVER public
generateStorageKey(ext, {suffix?, now?}) // "yyyy/mm/<24hex>[-suffix].ext"
sanitizeOriginalName(name), isValidStorageKey(key)
```
`mime.ts`: `sniffMime(bytes)` (magic bytes; SVG never accepted), `PUBLIC_IMAGE_MIME`
(jpeg/png/webp/avif), `ATTACHMENT_MIME` (+pdf), limits (media 15 MB, attachments 4×4 MB).
Keys are random and immutable — replacing an image means a new key (the `/media` route sends
`Cache-Control: immutable`). `/media` serves only raster types with `nosniff`, `inline`,
`CSP sandbox`. Private files are streamed only by an authenticated admin route (cms-admin:
`requireUser({mode:"throw"})`, `Content-Disposition: attachment`, `no-store`). Both roots
must be separate persistent volumes in production (checked at startup: not nested, not in `/public`).

## 12. Leads — `src/lib/leads/`

- `options.ts`: `PROJECT_TYPES`, `BUDGET_RANGES`, `TIMELINES`, `LEAD_REGIONS`,
  `LEAD_STATUS_LABELS`, `CONSENT_TEXT_VERSION`, `CONSENT_CHECKBOX_LABEL`, `PRIVACY_NOTICE_SHORT` (draft).
- `schema.ts`: `LeadInputSchema`, `LEAD_FIELDS` (FormData names incl. honeypot `website`
  and `formStartedAt`), `regionFromInput`.
- `service.ts`: `submitLead(rawFields, {ip, userAgent}, files?) → {ok, leadId} | {ok:false, error, fieldErrors?}`;
  `deliverLeadNotification(leadId, actorId?)` (admin « Renvoyer »: OWNER/EDITOR guard by caller).
  Order: validate → honeypot / min fill 3 s (silently discarded) → rate limit (5/h per IP,
  3/h per e-mail) → **save lead** (+ private attachments) → send mail → record
  `mailDeliveryState`, `mailAttempts`, `lastMailError` (sanitized). Mail failure never loses a lead.
- `retention.ts`: `purgeExpiredLeads(now?, actorId?)`, `extendLeadRetention(id)`.

**Lead lifecycle:** NEW → CONTACTED → QUOTED → WON | LOST; SPAM; ARCHIVED. `retentionUntil
= createdAt + leads.retentionDays` (default 3 years — CNIL guidance for prospects, **to be
confirmed by owner/legal**); extend on new contact. SPAM purged after 30 days; soft-deleted
leads purged after 30 days; purge deletes row + private files and writes an audit entry.
Data minimisation: no raw IP (HMAC), UA truncated, consent timestamp + text version stored,
no analytics. Export (CSV) is OWNER-only and audited. Rights requests → privacy mailbox
(not provisioned yet).

## 13. Mail — `src/lib/mail/`

`getMailer()` returns `SmtpMailer` only if NODE_ENV≠test **and** `SMTP_HOST/PORT/USER/PASSWORD`
+ `MAIL_FROM` set **and** setting `mail.enabled`; else `DisabledMailer` (NOT_CONFIGURED).
`MemoryMailer` + `setMailerForTests()` for tests. `sanitizeMailError()`. Hostinger suggestion:
`smtp.hostinger.com:465`, `SMTP_SECURE=true` — documentation only, not enabled.

## 14. SEO stub — `src/lib/seo/metadata.ts`

`buildMetadata({ title, description?, path, noindex?, ogImage?, type?: "website"|"article",
publishedTime?, modifiedTime? }): Metadata` → absolute canonical on `SITE_URL`, `fr_FR` OG,
robots. Owned/extended by seo-content; signature stable.

## 15. HTTP security

`next.config.ts`: CSP (static, no nonce: `script-src 'self' 'unsafe-inline'` — Next requires it
without nonces; mitigated by no user HTML anywhere; nonce CSP via proxy is a follow-up that
forces dynamic rendering), `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`X-Frame-Options: DENY` + `frame-ancestors 'none'`, Permissions-Policy, COOP, HSTS (prod only),
`poweredByHeader:false`, `/admin*` → `X-Robots-Tag: noindex, nofollow` + `no-store`.
Server Action body limit 20 MB. `images.localPatterns` allow `/media/**`.

## 16. Tests

`npm test` runs `tests/unit/*` and `tests/integration/*` against a fresh `prisma/test-vitest.db`
built from the committed migrations (global setup), storage under `.tmp/test-storage`.
`tests/support/db.ts#resetDb()` clears all tables. Mail is always disabled in tests.
