# Hostinger persistence & build-viability test (isolated, disposable data only)

**Status: NOT RUN.** Nothing here has been executed on Hostinger. Until sections A–C pass, local storage is *unproven* and
production deployment must stay blocked. If a mandatory test fails, the decision is automatic: **switch to S3-compatible storage**
(`docs/DEPLOYMENT.md` §4b) — provider choice and purchase remain the owner's.

Rules: use a **disposable MySQL database**, throw-away secrets, no customer data, `SITE_INDEXING` unset (whole site noindex),
mail/SMTP unset. Run it on a test site (a Hostinger temporary/sub-domain of a site you own; or `btnv.fr` itself *before* launch
while it holds no real data, with the owner's explicit go-ahead). Never touch other sites or mailboxes.

Only HTTP and hPanel are needed — **no SSH and no `npm` on the server**: the app itself exposes the token-protected endpoint
`POST /api/maintenance/storage-canary` (actions `write | check | cycle | cleanup`), which writes, reads, deletes and recreates
test objects as the *same OS user and the same process* that will serve production, and records `cwdHash` (a hash of the release
folder) to prove that the code ran from a different deployment folder after each redeploy. Paths and secrets are never returned.

## A. Preparation (hPanel, owner)
1. Create a **disposable** MySQL database + user (hPanel → Databases). Keep credentials only in the password manager.
2. Pick the candidate directory **outside `hbuilds/` and `public_html/`**, as a sibling of `domains/` in the account home
   (File Manager: the folder that contains `domains/`), e.g. `<home>/batinova-data/media` and `<home>/batinova-data/private`
   (create both; they must be different folders). The absolute `<home>` path is shown in hPanel (File Manager breadcrumbs / SSH
   details / the error page of a failed build). Do **not** guess it: a wrong absolute path makes the app refuse to start (good).
3. Environment (only after owner approval): `NODE_ENV=production`, `SITE_URL=https://<test-host>`, `DATABASE_URL=mysql://USER:PASS@127.0.0.1:3306/DB`,
   `SESSION_SECRET`, `IP_HASH_SECRET`, `MAINTENANCE_TOKEN` (three distinct random ≥32-char values), `STORAGE_DRIVER=local`,
   `MEDIA_STORAGE_DIR`, `PRIVATE_STORAGE_DIR` (the two absolute paths). Leave `SITE_INDEXING`, `SMTP_*`, `BOOTSTRAP_OWNER_*` unset.
4. Build command: see section D (probe first). Create one header file for curl: a text file containing
   `Authorization: Bearer <MAINTENANCE_TOKEN>` on your own computer (never in the repo, never pasted into a chat).
   Shortcut used below: `C='curl -fsS -X POST -H @token.hdr -H content-type:application/json https://<test-host>/api/maintenance/storage-canary -d'`.

## B. Mandatory tests (all must pass)
| # | Test | Action | Expected |
|---|---|---|---|
| B1 | Candidate directory usable | first deploy; open `/` once (app start creates markers) | app starts; if the path is wrong/unwritable the process refuses to start (log: "not writable" / persistence error) → fix path |
| B2 | Write + read | `$C '{"action":"write"}'` then `$C '{"action":"check"}'` | `ok:true`, `publicPresent` and `privatePresent` true |
| B3 | Delete + recreate | `$C '{"action":"cycle"}'` | `ok:true`; every check true (write, delete, recreate, `privateNotInPublicScope`) |
| B4 | Restart keeps files | hPanel → Restart (no rebuild); `check` | `ok:true`, entry `survivedRestart:true`, `survivedRedeploy:false` |
| B5 | Redeploy #1 | push a trivial commit (or hPanel Redeploy); after it is live: `write`, `check` | `ok:true`; earlier entry `survivedRedeploy:true`; `distinctDeploymentsSeen:2` |
| B6 | Redeploy #2 | repeat; `check` | `ok:true`, **`twoRedeploysProven:true`**, `distinctDeploymentsSeen:3`. Hostinger now has pruned the first release folder (only 2 are kept), so the files demonstrably do not live there |
| B7 | Persistence guard | restart once more | starts normally (markers match the database record). Negative test (optional, disposable data only): in File Manager rename `private` → `private_x`, restart → the app must refuse to start; rename back, restart → starts |
| B8 | Access boundaries | see section C | all expectations met |

Pass = B1–B8. A single failure, or `survivedRedeploy:false` for an entry written by an earlier deployment, means the directory is
**not persistent → block production → use S3**.

## C. Access boundaries (curl, no login except where stated)
From `write`'s response take `publicPath` and `privateProbePath`:
- `GET <publicPath>` → **200**, `image/png`, `x-content-type-options: nosniff` (public media is served).
- `GET <privateProbePath>` (the private canary's key under `/media`) → **404** (private storage is never served publicly).
- `GET /media/../` style traversal and `GET /media/.batinova-storage.json` → **404**.
- `GET https://<test-host>/batinova-data/private/` and `/batinova-data/media/` → **404/403** (the folders are not under any web root;
  if you see a directory listing or the marker file, move the folders).
- `GET /admin` and `GET /admin/demandes` without cookie → redirect to `/admin/login` (private attachment route is admin-only).
- `POST /api/maintenance/storage-canary` without token → **404** if `MAINTENANCE_TOKEN` is unset, **401** with a wrong token.
- Directory permissions (File Manager → permissions): the two folders `700` (or `750` at most), no world-readable bit.

## D. Build viability (`npm run build:hostinger`) — probe first
`build:hostinger` runs `prisma generate` → `deploy:setup` (migrate + seed + bootstrap) → `next build`. Whether Hostinger's **build**
environment can reach `127.0.0.1:3306`, still has devDependencies (prisma, tsx) and sees the same env is **unproven**.
1. First test deployment: build command `npm run deploy:probe && npm run build` (probe is informational, always exit 0, prints only
   presence/booleans, versions and collation — read the build log). Check: `connection: OK`, `privilege CREATE/ALTER/DROP/INDEX/REFERENCES: true`,
   `GET_LOCK works: true`, `prisma cli present` and `tsx present: true`, `database host is 127.0.0.1: true`, charset/collation, row format `dynamic`.
2. If the probe shows the connection works and tooling exists → switch the build command to `npm run build:hostinger` and deploy again;
   confirm in the log: `database reachable`, `deployment lock acquired`, `migrate deploy ok`, `seed … ok`, `owner bootstrap: …`.
3. If the build host cannot reach MySQL (`connection: FAILED`) or lacks devDependencies: **do not** use `build:hostinger`. Keep `npm run build`
   and run `deploy:setup` once from a one-shot cron (command + env file as in `docs/DEPLOYMENT.md` §6/§8), or fall back to an
   owner-run migration from your own computer against the remote MySQL (hPanel → Remote MySQL, your IP only, removed afterwards).
4. Failure behaviour to confirm once on a test deploy: temporarily set a wrong `DATABASE_URL` password → the build must fail at
   `deploy:setup`, the previously live version must keep serving and the password must not appear in the build log. (Locally verified:
   exit code 1 before any change, no secret in output; Hostinger's "failed build leaves the live version" is the owner's documentation
   and still to be observed.)
5. Concurrent deployment: two overlapping builds serialise on the MySQL lock (locally verified); the second waits up to 120 s.

## E. Backup / restore feasibility
- With a shell or a cron that accepts a bash command: `scripts/ops/backup.sh` (copy `scripts/ops/*.sh` and a `backup.env` to
  `<home>/batinova-private/`, chmod 600/700). Needs `mysqldump` or `mariadb-dump`, `tar`, `gzip`, `sha256sum` on the host — **verify with
  `command -v` via cron output**; if cron only accepts `node …`, use the manual route: phpMyAdmin/hPanel export of the database +
  File Manager "Compress" of both data folders, download, store encrypted off-site.
- Restore test on scratch targets only (new empty database, new empty folders): load the dump, extract both archives **including the
  marker files**, point a copy of the env at them, start, run `check`. DB and files from different sets must be refused by the guard.
- Record: date, who ran it, set name, result.

## F. Cleanup
`$C '{"action":"cleanup"}'` (removes the canary objects and the DB record), delete the disposable database/user and, if the site was only
a test, the test environment variables. Remove `MAINTENANCE_TOKEN` when the purge cron is not yet configured.

## G. Report template
Date · Hostinger plan · candidate path class (outside `domains/`? yes/no) · B1–B8 pass/fail · probe output summary (no secrets) ·
build viability verdict (A: `build:hostinger` works / B: cron or remote-migrate fallback) · decision: **local storage accepted / S3 required**.
