# BatiNova — Local run, deployment & operations

Nothing here has been deployed. Hostinger database creation, DNS and environment variables are done by the owner
(see §10 "Steps on Hostinger"); no real credentials exist in this repository.

## 1. Architecture (decision 002)

| Layer | Choice |
|---|---|
| Hosting | Hostinger **Business Web Hosting**, managed Node.js Web App (GitHub deployment), Node 24 |
| Database | **Hostinger MySQL** (MariaDB-compatible) through Prisma 7 + `@prisma/adapter-mariadb` |
| Files | `STORAGE_DRIVER=local` on a **verified persistent directory outside `hbuilds/` and `public_html/`**, or `STORAGE_DRIVER=s3` (S3-compatible bucket; provider = owner decision) |
| Compatibility | tested on MariaDB 10.11 **and MySQL 8.0** (full suite incl. migrate/seed/drift). MySQL 8 needs `allowPublicKeyRetrieval` without TLS: enabled automatically on 127.0.0.1 only. Tables are pinned to `utf8mb4_unicode_ci`, independent of the database default (tested on a latin1 database) |
| Instances | one app process (rate limits are DB-backed and atomic, so several would work, but local files need one) |

SQLite was removed. Its history is archived in `docs/archive/sqlite-migrations/` (not portable); `prisma/migrations/`
holds a fresh MySQL baseline. There was no production data, so no data migration exists.

## 2. Local development

Requires Node 24 and a local MySQL/MariaDB (e.g. `apt install mariadb-server`). Use throwaway databases whose names
contain `dev` / `test`.

```bash
npm ci                                   # also runs `prisma generate`
cp .env.example .env                     # set DATABASE_URL (mysql://USER:PASS@127.0.0.1:3306/batinova_dev) + 2 secrets
npm run db:deploy                        # apply committed migrations
npm run db:seed                          # create-if-missing seeds (idempotent; ~2 min: it renders the sample images)
npm run admin:create -- --email you@example.com --name "Prénom Nom" --role OWNER   # hidden prompt
npm run dev                              # http://localhost:3000, admin at /admin
```
Secrets: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` (one per secret). Never commit `.env`.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run test:e2e`.
Tests use their own databases (`TEST_DATABASE_URL`, default
`mysql://batinova_test:batinova_test@127.0.0.1:3306/batinova_vitest_test`; `E2E_DATABASE_URL` for Playwright). Helpers refuse
any database whose name does not contain `test`. Create the throwaway user once:
`CREATE USER 'batinova_test'@'127.0.0.1' IDENTIFIED BY 'batinova_test'; GRANT ALL ON \`%test%\`.* TO 'batinova_test'@'127.0.0.1';`

Schema changes: edit `prisma/schema.prisma` → `npm run db:migrate -- --name <change>` → commit the migration folder.
Never edit an applied migration. Write migrations **backward compatible** (add → deploy → remove later): they run while the
previous version still serves. `npm run db:reset` needs `ALLOW_DB_RESET=true`, a local host and a `dev`/`test` database name.

## 3. Deployment lifecycle on Hostinger (from Hostinger's documentation as relayed by the owner)

- Every successful GitHub deployment is built into its own folder under `hbuilds/` (`hbuilds/versions/<build-id>/`),
  `hbuilds/current` points to the live one, only the **latest two successful builds are kept**, a failed build leaves the live
  version untouched.
- `hbuilds/` and `public_html/` belong to the deployment system: **never store the database, media, attachments, backups
  or `.env` there.** `production.ts` refuses storage paths containing `hbuilds` or `public_html`.
- Environment variables are injected into build and runtime and survive redeploys; saving them triggers a redeploy.
- Cron Jobs run in UTC, are stopped after 30 minutes and do **not** receive the site's environment variables.
- SSH exists on Business, but running npm/Node commands over SSH for a managed Node app may not be supported: nothing in this
  repository requires SSH (everything has a build-step, startup or cron path).
- Not verifiable from this environment (docs hosts are not reachable here): exact build/start commands UI, Node-over-SSH, and
  whether a directory outside the deployment folders survives. §4 makes persistence a *measured* property, not an assumption.

## 4. File storage and persistence

**Decision rule:** a directory is accepted for production only after the canary below proves it survives a redeployment.

### 4a. Local driver (preferred if the canary passes)
- `MEDIA_STORAGE_DIR` (public, served by `/media/<key>`) and `PRIVATE_STORAGE_DIR` (lead attachments, only streamed to an
  authenticated admin) are two separate, non-nested, **absolute** directories outside `hbuilds/` and `public_html/`,
  e.g. `/home/<hostinger-user>/batinova-data/media` and `/home/<hostinger-user>/batinova-data/private` (the user home is
  *outside* the web root, so there is no URL to them; each root also gets a deny-all `.htaccess` as defence in depth).
  Directories are created `0700`, files `0600`; the app user owns them.
- **Persistence guard (automatic, every start):** each root has a marker `.batinova-storage.json` with a random id; the same ids are
  stored in the database (`Setting` key `system.storage`). Marker + record match → start. Marker missing while the database
  knows the storage → **the app refuses to start** (wiped / unmounted directory) instead of silently serving an empty library or
  losing attachments. Fresh install (no record) → markers are created automatically. A restore must bring the markers back with the
  files (the backup scripts do), and a database-only restore will be refused until the matching files are restored.
- **Canary test (before go-live, on Hostinger, disposable data only): `docs/HOSTINGER_PERSISTENCE_TEST.md`.** It needs **no SSH and no
  npm on the server**: the token-protected `POST /api/maintenance/storage-canary` (`write|check|cycle|cleanup`) writes/reads/deletes/recreates
  test objects as the running app and records a hash of the release folder, so `check` after two redeployments can state
  `twoRedeploysProven:true`. (`npm run storage:canary -- write|check` is the equivalent when a shell with Node exists.)
  **Status: not run.** Until it passes, local storage is unproven and production stays blocked; if it fails → §4b (S3).
- Backups: §9. Permissions: `chmod 700` on both roots, nothing world-readable.

### 4b. S3-compatible driver (if persistence cannot be proven)
Implemented and tested against an in-memory S3 (`src/lib/storage/s3.ts`). **No provider, bucket or paid service is chosen:
that is the owner's decision** (candidates to compare: any S3-compatible object storage with EU region and private buckets, e.g.
Hetzner/Scaleway/OVH object storage, Cloudflare R2, Backblaze B2, AWS S3).
Required: a **private** bucket (block public access), a key limited to that bucket, `STORAGE_DRIVER=s3`, `S3_BUCKET`,
`S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_ENDPOINT` (https), `S3_REGION`, `S3_FORCE_PATH_STYLE` as the provider requires,
optional `S3_PREFIX`. Media lives under `<prefix>/media/…`, attachments under `<prefix>/private/…`; the bucket is never public —
`/media/<key>` and the admin attachment route stream through the app. Enable versioning/lifecycle rules at the provider for
backup (§9). Credentials only in Hostinger's environment, never in code.
Egress/latency note: every media request goes bucket → app → visitor (images are cached for a month by the route).

## 5. Environment variables (Hostinger panel)

| Variable | Value / rule |
|---|---|
| `NODE_ENV` | `production` (Hostinger usually sets it) |
| `SITE_URL` | `https://btnv.fr` · `SITE_INDEXING=true` and `CANONICAL_HOST=btnv.fr` only on the final domain; any preview/staging domain keeps `SITE_INDEXING` unset (whole site noindex, empty sitemap; validated) |
| `DATABASE_URL` | `mysql://USER:PASSWORD@127.0.0.1:3306/DATABASE` (percent-encode the password; host **must be 127.0.0.1**, validated) |
| `SESSION_SECRET`, `IP_HASH_SECRET` | ≥32 random chars each, distinct |
| `MAINTENANCE_TOKEN` | ≥32 random chars, distinct; enables the cron endpoints (§8) |
| `STORAGE_DRIVER` + dirs or `S3_*` | §4 |
| `TRUST_PROXY`, `TRUST_PROXY_HOPS`, `CLIENT_IP_HEADER` | §7 |
| `BOOTSTRAP_OWNER_EMAIL/NAME/PASSWORD_HASH` | first install only (§6), then delete |
| `SMTP_*`, `MAIL_FROM` | stay empty until mailbox + MX/SPF/DKIM/DMARC are verified (mail is disabled otherwise) |
| `CSP_ANALYTICS_PROVIDER` | empty (no tracking before consent decisions) |
| `ALLOW_EPHEMERAL_PATHS`, `ALLOW_REMOTE_DATABASE` | **never** set on the real deployment |

`NODE_ENV=production` start-up fails fast (`src/instrumentation.ts` + `src/lib/config/production.ts`) on missing/weak/duplicate
secrets, non-https `SITE_URL`, non-`mysql://` or non-127.0.0.1 `DATABASE_URL`, missing password, storage inside `hbuilds/`/`public_html/`,
identical media/private roots, incomplete S3 settings, weak `MAINTENANCE_TOKEN`, invalid proxy settings, or indexing enabled for a
non-canonical origin. Messages name variables, never values.

## 6. First installation (no public registration endpoint)

> **Viability on Hostinger is UNPROVEN.** Whether the managed build environment reaches `127.0.0.1:3306`, keeps devDependencies and
> sees the environment variables must be measured with `npm run deploy:probe` in a test deployment (`docs/HOSTINGER_PERSISTENCE_TEST.md` §D)
> before `build:hostinger` is trusted. Fallbacks are described below.

> **Production-only installs.** Hostinger may install with `--omit=dev` (first deploy failed with `tsx: command not found`). Everything
> `build:hostinger` and the ops scripts need (`prisma`, `tsx`, `mariadb`, `typescript`, `tailwindcss`, `@tailwindcss/postcss`, `@types/*`) is
> therefore in `dependencies`; `next build` type-checks with `tsconfig.build.json` (no tests). CI job `prod-install` guards this
> (`npm ci --omit=dev && node scripts/verify-prod-deps.mjs && npx next build`). Re-runs are safe: migrations are advisory-locked, the seed is create-if-missing and
> the owner bootstrap is a no-op once an OWNER exists; a failure before `next build` aborts the deploy and the previous version keeps serving.

Build command to configure in Hostinger (Build Settings): **`npm run build:hostinger`**
(= `prisma generate` → `npm run deploy:setup` → `next build`); start command stays `npm run start`.

`deploy:setup` (idempotent, safe on every deployment):
1. pre-flight `SELECT 1`; **database unreachable → exit 1 → the build fails, nothing is changed and Hostinger keeps the live
   version** (verified locally by test: no migration, seed or write is attempted; credentials are not printed);
2. MySQL named lock `batinova_deploy_setup` (two concurrent deployments cannot migrate together);
3. `prisma migrate deploy` (pending committed migrations only; no reset/drop);
4. seed, create-if-missing (never overwrites owner edits, never creates users);
5. first OWNER from `BOOTSTRAP_OWNER_*` — **no-op as soon as any OWNER exists**, refuses non-hash input and never promotes an existing
   EDITOR; the same check also runs at server start (so it works even if the build host cannot reach the database).

First OWNER, step by step: on **your own computer** run `npm run admin:hash` (hidden prompt; prints an Argon2id hash, never the
password), put `BOOTSTRAP_OWNER_EMAIL`, optional `BOOTSTRAP_OWNER_NAME` and `BOOTSTRAP_OWNER_PASSWORD_HASH` in the Hostinger
environment, deploy, log in at `/admin/login`, then **delete the three variables** (the app logs a warning while they linger).
Alternative with a shell: `npm run admin:create` (also the emergency password reset).

If the Hostinger build container cannot reach MySQL (127.0.0.1 may mean a different host at build time): use the plain
`npm run build` as build command and run `deploy:setup` once from a one-shot cron job (loading the env file as in §8), then remove
that cron entry. Verify which situation applies on the first deployment.

## 7. Reverse proxy and client IP

IP-based limits (login, quote form, maintenance endpoint) use `getClientIp`. `TRUST_PROXY=false` (default) puts all visitors in
one bucket (safe, degraded). To enable per-visitor limits on Hostinger **measure first**:
1. set `MAINTENANCE_TOKEN`, keep `TRUST_PROXY=true`, `TRUST_PROXY_HOPS=1`;
2. from a machine whose public IP you know: `curl -fsS -X POST -H "Authorization: Bearer $MAINTENANCE_TOKEN" https://btnv.fr/api/maintenance/proxy-check`;
3. read `xffEntries`, `derivedIp`: `derivedIp` must be YOUR address. If `xffEntries` is 2+ (CDN + web server) raise
   `TRUST_PROXY_HOPS`; if the provider overwrites a single header you can name it with `CLIENT_IP_HEADER`;
4. also confirm that the app is only reachable through the Hostinger proxy (otherwise clients could forge headers). If you cannot
   prove it, leave `TRUST_PROXY=false`.
Fewer `X-Forwarded-For` entries than `TRUST_PROXY_HOPS` yields `unknown` (never trusts a request that skipped a proxy).
TLS, http→https and `www`→apex redirects are handled by Hostinger/hPanel (`CANONICAL_HOST` adds the app-level `www` 301).

## 8. GDPR retention purge (cron)

Required daily. Cron jobs have no site environment, so the cron calls the running app, which has it:

1. env: `MAINTENANCE_TOKEN=<random ≥32>`.
2. Create `/home/<user>/batinova-private/purge-header` (chmod 600, outside the web root) with one line: `Authorization: Bearer <same token>`.
3. hPanel → Advanced → Cron Jobs (UTC; pick an off-peak minute, e.g. `17 1 * * *` = 02:17/03:17 Paris):
```
curl -fsS -X POST -H @/home/<user>/batinova-private/purge-header https://btnv.fr/api/maintenance/purge
```
`POST` only, constant-time token check, 404 when the token is unset, wrong tokens are throttled (401 → 429) but a valid token is
never blocked, response = counts only. Alert on a non-zero curl exit / missing log line. Alternatively run the CLI
`npm run maintenance:purge` where Node + env are available. An OWNER can also purge from the leads inbox. **Re-run it after any restore.**

## 9. Backups and restore

Scripts (tested locally against MariaDB: dump → simulated disaster → restore → data and files identical; tampered set refused):
- `scripts/ops/backup.sh ENV_FILE` — consistent `mysqldump --single-transaction` + `media.tar.gz` + `private.tar.gz` + `SHA256SUMS`
  in `BACKUP_DIR/<UTC-stamp>/`, `umask 077`, retention `BACKUP_KEEP_DAYS` (30), optional GPG encryption (`BACKUP_GPG_RECIPIENT`).
  Run daily by a Hostinger cron (30-min limit): `bash /home/<user>/batinova-private/backup.sh /home/<user>/batinova-private/backup.env`
  (copy `scripts/ops/*.sh` to that persistent folder once; they are not needed inside the build).
- Off-site: copy the (encrypted) set to storage you control (the dumps contain leads = personal data); Hostinger's own backups
  are a convenience, not the plan, until their scope and restore path are verified in hPanel. With S3, enable bucket versioning.
- S3 mode: only the database is dumped; files are protected by the provider (versioning, replication).
- `scripts/ops/restore.sh ENV_FILE SET_DIR [--yes]` — verifies checksums (dry run without `--yes`), keeps the current state aside
  (`pre-restore-<stamp>`), drops tables, loads the dump, restores both storage directories **with their markers**.

**Restore-test procedure (monthly, on a scratch database/directories, never on production):**
1. create an empty test DB and two empty dirs; point a copy of the env file at them;
2. `restore.sh copy.env <latest set> --yes`; 3. `npm run db:status` (up to date) ; 4. start the app against it
(`npm run start`), open `/admin/login`, a media URL and one attachment as OWNER; 5. run `npm run maintenance:purge`;
6. record date, set name, result. DB and files must come from the same set, or the persistence guard (rightly) refuses to start.

## 10. Steps on Hostinger (owner actions — none done yet)

1. hPanel → Databases → create the MySQL database + user (note the exact names); keep the password in a password manager.
2. Add the Node.js Web App from GitHub (repo `MustafaBasol/batinova`, branch decided by the owner, Node 24); build command
   `npm run build:hostinger` (see §6 fallback), start `npm run start`.
3. Create the persistent folders (§4a) over File Manager/SSH, `chmod 700`; or choose an S3 provider (§4b) — *decision needed*.
4. Set the environment variables (§5) — only after the owner approves; generate the secrets locally.
5. First deploy → canary (§4a) → proxy check (§7) → login with the bootstrap owner → delete `BOOTSTRAP_OWNER_*`.
6. Cron jobs: purge (§8) and backup (§9). Take one manual backup and one dry-run restore before go-live.
7. Only then: DNS for `btnv.fr`, `SITE_INDEXING=true`, `CANONICAL_HOST=btnv.fr`. Placeholder/demo pages stay `noindex`
   (the per-page flag is kept; `docs/SEO_IMPLEMENTATION.md` §9 post-deploy checks).

Rollback: Hostinger keeps the previous successful build; redeploy it from the panel. Additive migrations stay compatible with it.
A failed build never replaces the live version. Data is never touched by a code rollback.

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
- [ ] Hostinger Business: MySQL database created, persistent-storage decision (§4), backup destination (§9).

## 8. SEO switches (seo-content, Phase 4)
- `SITE_INDEXING=true` is required **only in production** (https://btnv.fr). Any other value keeps the whole site out of search engines (robots.txt `Disallow: /`, empty sitemap, `X-Robots-Tag: noindex, nofollow` header and `<meta name="robots" content="noindex">`).
- `CANONICAL_HOST=btnv.fr` enables the `www.btnv.fr` -> `https://btnv.fr` 301 (done in `src/proxy.ts`). Also redirect `http` -> `https` and `www` at the reverse proxy / DNS level if possible.
- `SITE_URL=https://btnv.fr` must be set in production (canonical, sitemap, Open Graph, JSON-LD are all built from it).
- The static CSP in `next.config.ts` allows no third-party origin: enabling Plausible or GA4 in /admin also requires adding the provider origins to `script-src` / `connect-src` (and `img-src` for GA4). Not done by default.
- Post-deploy checks: see `docs/SEO_IMPLEMENTATION.md` section 9.
