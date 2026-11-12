# BatiNova — Local run, deployment & operations notes

Nothing here has been deployed. No hosting platform, credentials or DNS are assumed.

## 1. Local development

```bash
npm ci                     # also runs `prisma generate`
cp .env.example .env       # then generate secrets (see below); a dev .env may already exist
npm run db:deploy          # apply committed migrations to prisma/dev.db (or db:migrate in dev)
npm run db:seed            # create-if-missing seeds (never overwrites owner edits)
npm run admin:create -- --email you@example.com --name "Prénom Nom" --role OWNER   # hidden prompt
npm run dev                # http://localhost:3000, admin at /admin
```
Secrets: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` — one
for `SESSION_SECRET`, another for `IP_HASH_SECRET`. Never commit `.env`.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run start`.
`npm run db:reset` is refused when `NODE_ENV=production` or for non-file databases.
Schema changes: edit `prisma/schema.prisma` → `npm run db:migrate -- --name <change>` → commit
the new folder under `prisma/migrations/`. Never edit an applied migration.

## 2. Hosting options (decision pending — owner)

The app needs a **long-running Node 24 process + persistent disk** (SQLite file, media,
private attachments). It is therefore NOT suited to purely serverless/ephemeral platforms
unless storage is moved to PostgreSQL + object storage (see §5).

| Option | Pros | Cons |
|---|---|---|
| Managed VPS/PaaS with persistent volume (e.g. a container platform offering volumes, or a small VPS with Docker/systemd + reverse proxy) | Cheapest, SQLite works as-is, full control | You own OS patches, TLS renewal, backups, monitoring |
| Managed PaaS + managed PostgreSQL + S3-compatible storage | Less ops, automated DB backups, horizontal scaling | Higher monthly cost, requires PostgreSQL migration and an S3 storage driver |
| Shared web hosting (e.g. the domain's existing hosting plan) | Already paid for | Often no long-running Node or unsuitable; verify Node 24 + persistent writable disk first |

Recommendation: start with a single instance + persistent volume (SQLite), behind a
TLS-terminating reverse proxy, with off-site backups; move to managed PostgreSQL if
multiple instances or higher write volume are needed. Run exactly **one** app instance on
SQLite.

## 3. Production configuration

- `NODE_ENV=production`, `SITE_URL=https://btnv.fr` (after DNS verification).
- `DATABASE_URL=file:/data/db/batinova.db`, `MEDIA_STORAGE_DIR=/data/media`,
  `PRIVATE_STORAGE_DIR=/data/private` — all on **persistent volumes**, not the container FS.
  Media and private roots must be distinct and not nested; the app refuses otherwise.
- `SESSION_SECRET`, `IP_HASH_SECRET`: distinct ≥32-char random values from the platform's
  secret store. Rotating `SESSION_SECRET` logs out all admins; rotating `IP_HASH_SECRET`
  resets rate-limit identities.
- `TRUST_PROXY=true` only behind a proxy that overwrites `X-Forwarded-For`.
- Deploy steps: `npm ci` → `npm run build` → `npm run db:deploy` → `npm run start`
  (HTTPS required: session cookie is `__Host-` + Secure in production).
- Mail stays off until: mailbox exists, MX/SPF/DKIM/DMARC verified, `SMTP_*` + `MAIL_FROM` set,
  and the OWNER enables « Envoi d’e-mails » in settings. Hostinger suggestion:
  `SMTP_HOST=smtp.hostinger.com`, `SMTP_PORT=465`, `SMTP_SECURE=true`.

## 4. Backups & maintenance

- SQLite: online backup with `sqlite3 /data/db/batinova.db ".backup '/backups/batinova-$(date +%F).db'"`
  (or the better-sqlite3 `.backup()` API) — do not copy the live file while writing. Daily,
  keep 30 days, copy off-site, encrypted (contains leads = personal data). Test restores monthly.
- Media and private dirs: daily incremental sync (e.g. restic/rclone) to encrypted off-site storage.
- Scheduled retention purge: see "Retention purge cron" below.
- Restoring a backup can resurrect purged leads: re-run the purge after any restore.

### Retention purge cron (GDPR) — REQUIRED in production

`npm run maintenance:purge` deletes leads past their retention date (and spam / long-soft-deleted leads, with
their private attachments), expired sessions and stale rate-limit buckets. It logs counts only. Run it daily
from the app directory with the production environment loaded (`.env` is read automatically):

```
17 3 * * * cd /srv/batinova && /usr/bin/npm run maintenance:purge >> /var/log/batinova-purge.log 2>&1
```

An OWNER can also trigger the lead part from the leads inbox ("Purger les demandes arrivées à échéance"; audited).
Re-run it after any backup restore.

## 5. PostgreSQL migration path

1. `datasource db { provider = "postgresql" }`; replace adapter with `@prisma/adapter-pg`
   (`new PrismaPg({ connectionString })`) in `src/lib/db.ts` and `prisma/seed/client.ts`.
2. Generate a fresh baseline migration for PostgreSQL in a new folder (SQLite migrations are
   not portable); keep the SQLite history archived.
3. Copy data with a one-off script (read via SQLite client, write via PG client, in FK order:
   User → Media → Category/Tag → Page → Post/PostTag → Project/ProjectMedia → revisions → Lead/LeadAttachment → NavItem → Setting → Redirect → AuditLog).
4. Rate limiting & sessions work unchanged (already DB-backed). Consider `citext` for e-mails.
5. For multi-instance deployments add an S3-compatible `StorageDriver` (same interface).

## 6. Security operations

- Admin accounts only via `npm run admin:create` (also serves as emergency password reset;
  revokes the user's sessions). Minimum 12 characters; no default credentials exist.
- Lockouts clear automatically (15 min doubling, max 24 h) or via `admin:create`.
- Logs never contain passwords, tokens, raw IPs or SMTP credentials; audit summaries strip PII.
- Before enabling any analytics: consent banner + CNIL review + CSP update.

## 7. Owner checklist (blocking before production — do not invent)

- [ ] Legal identity: raison sociale, forme, capital, SIREN/SIRET, RCS, TVA, directeur de publication.
- [ ] Hosting provider identity for mentions légales.
- [ ] Phone, public e-mail, confirmed address (4 rue des Lilas, 93600 Aulnay-sous-Bois is user-supplied).
- [ ] Assurance décennale: certificate + scope (only then mention it).
- [ ] Confirmed services list and real operating sectors (IDF, Normandie, Manche).
- [ ] Real project photos with rights + client permission; otherwise keep placeholders labelled.
- [ ] Privacy: controller identity, lead retention (default 3 years — confirm), rights contact mailbox.
- [ ] Domain/DNS/mail access; MX/SPF/DKIM/DMARC; which mailboxes are real vs aliases.
- [ ] Google Search Console / Business Profile ownership (owner-verified only).
- [ ] Hosting choice (§2) and backup destination.

## 8. SEO switches (seo-content, Phase 4)
- `SITE_INDEXING=true` is required **only in production** (https://btnv.fr). Any other value keeps the whole site out of search engines (robots.txt `Disallow: /`, empty sitemap, `X-Robots-Tag: noindex, nofollow` header and `<meta name="robots" content="noindex">`).
- `CANONICAL_HOST=btnv.fr` enables the `www.btnv.fr` -> `https://btnv.fr` 301 (done in `src/proxy.ts`). Also redirect `http` -> `https` and `www` at the reverse proxy / DNS level if possible.
- `SITE_URL=https://btnv.fr` must be set in production (canonical, sitemap, Open Graph, JSON-LD are all built from it).
- The static CSP in `next.config.ts` allows no third-party origin: enabling Plausible or GA4 in /admin also requires adding the provider origins to `script-src` / `connect-src` (and `img-src` for GA4). Not done by default.
- Post-deploy checks: see `docs/SEO_IMPLEMENTATION.md` section 9.
