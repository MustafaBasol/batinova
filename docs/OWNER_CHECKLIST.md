# BatiNova — Owner verification checklist (private, do not publish)

Nothing below has been done on the owner's behalf. Do not invent or copy values: every item must come from your own official documents.
The site contains no company identifier, phone number, insurance, qualification, review or project that you have not supplied.
Tick an item only when the real value has been entered in `/admin` (Réglages) and checked.

## A. Legal identity (mentions légales and RGPD pages)

- [ ] Legal entity: exact legal name and form (SAS, SARL, EI…), share capital if applicable
- [ ] SIREN and SIRET (from the Kbis / INSEE notice)
- [ ] RCS city and number (or répertoire des métiers) as on the Kbis
- [ ] Intra-community VAT number (TVA), or confirmation that none applies
- [ ] Publication director (name and role) and a public contact e-mail
- [ ] Public phone number (only if you want one displayed; none is shown today)
- [ ] Head-office address confirmed: 4 rue des Lilas, 93600 Aulnay-sous-Bois (user-supplied, never independently validated). No branch offices are implied anywhere
- [ ] Hosting provider identity (name, address, phone) for the mentions légales: depends on the platform chosen in `docs/DEPLOYMENT.md`
- [ ] Data controller for the privacy policy (same entity as above), contact for GDPR requests, retention periods (default in Réglages) and processors (hosting, mail)
- [ ] Insurance and décennale: state them ONLY with a valid certificate (insurer, policy, validity, scope). Currently nowhere on the site
- [ ] Professional qualifications / labels (RGE, Qualibat…): only with proof. Currently nowhere on the site
- [ ] Legal pages reviewed by a lawyer or a qualified legal service, then remove their `noindex` and "à compléter" text

## B. Content to confirm

- [ ] Service list (rénovation, extension, construction): confirm or edit, then clear the "Contenu de démonstration" flag on each service page
- [ ] Service areas (Île-de-France, Normandie, Manche) confirmed; zone pages edited if needed
- [ ] Clear the placeholder flag on every page that is final (home, about, method, contact…). Placeholder pages are `noindex` and are excluded from the sitemap by design
- [ ] Photos: the current images are free-licence stock pictures marked "Illustration". Replace them with your own project photos only when you have the rights. Add real projects (Réalisations) with client consent
- [ ] No testimonial, rating, client name, price, delay or "years of experience" is published. Add them only if true and documented
- [ ] Review the 3 seeded draft articles (accuracy, tone, no unverified figures), edit if needed, then publish the 3 drafts together from `/admin/articles` (cover images are free-licence illustrations with alt text already set; the article text is not flagged as placeholder)
- [ ] Check the home, services and zone meta titles/descriptions in `/admin/pages`
- [ ] Confirm the `/devis` consent text and bump `leads.consentTextVersion` if you change it

## C. Search and analytics

- [ ] Google Search Console: verify the domain (DNS TXT) or paste the HTML-tag token in Réglages (SEO), then submit `https://btnv.fr/sitemap.xml`
- [ ] Google Business Profile: create/claim with the same NAP (name, address, phone). Declare a service-area business consistently, do not list Normandie/Manche as local offices
- [ ] Analytics: none is active. If wanted, pick Plausible or GA4, set `CSP_ANALYTICS_PROVIDER` BEFORE `npm run build`, enable it in Réglages, and keep the consent banner (CNIL: audience measurement other than exempt tooling needs prior consent). Update the privacy policy accordingly

## D. E-mail (nothing is sent today; leads are stored in `/admin/demandes`)

- [ ] Create the Hostinger mailbox(es) yourself (e.g. contact@btnv.fr)
- [ ] DNS (you, at your registrar): MX, SPF, DKIM, DMARC for btnv.fr. The agents never change DNS or create mailboxes
- [ ] Set `SMTP_HOST` (smtp.hostinger.com), `SMTP_PORT` (465), `SMTP_SECURE=true`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` as production secrets, then enable « Envoi d’e-mails » in Réglages and send a test lead

## E. Production environment and operations

- [ ] Hosting with a long-running Node 24 process and PERSISTENT disk (see `docs/DEPLOYMENT.md`); one instance only (local files); HTTPS terminated in front
- [ ] Env vars: `NODE_ENV=production`, `SITE_URL=https://btnv.fr`, `SITE_INDEXING=true` (only at launch, after sections A and B), `CANONICAL_HOST=btnv.fr`, `TRUST_PROXY=true` (only behind a proxy that overwrites `X-Forwarded-For`; otherwise all visitors share one rate-limit bucket), distinct 32+ character `SESSION_SECRET` and `IP_HASH_SECRET` from the secret store, `DATABASE_URL`, `MEDIA_STORAGE_DIR`, `PRIVATE_STORAGE_DIR` on separate persistent volumes
- [ ] Never leave `SITE_INDEXING=true` on staging or previews
- [ ] Deploy steps: Hostinger build `npm run build:hostinger` (migrate + seed + first OWNER from `BOOTSTRAP_OWNER_*`, see `docs/DEPLOYMENT.md` §6), start `npm run start`; or `npm run admin:create -- --email <you> --name "<Name>" --role OWNER` (hidden password prompt) and create the editor accounts from `/admin/utilisateurs`
- [ ] Remove or change every test/dev account; use long unique passwords
- [ ] Daily backups of the MySQL DB (`scripts/ops/backup.sh`), media and private dirs, copied off-site and encrypted; test a restore
- [ ] Cron for GDPR retention: `npm run maintenance:purge` daily (see `docs/DEPLOYMENT.md`); re-run it after any restore
- [ ] After go-live check with `curl -I`: HTTPS + HSTS, `www` redirects to apex (301), `/robots.txt` allows the site, `/sitemap.xml` lists only published pages
- [ ] Re-run `npm run build && npm run test:e2e` against the release candidate before the final DNS switch (these tests use an isolated local database and never touch production)

## F. Not covered by automated tests (do by hand before launch)

- [ ] Real-phone test of the quote form and the mobile menu (iOS Safari and Android Chrome); Firefox and Safari desktop
- [ ] Screen-reader pass (NVDA or VoiceOver) on home, quote form and admin login
- [ ] Lighthouse / PageSpeed measurement on the deployed site (no score has been measured yet)
- [ ] Rights and licences for every image, and a French proofreading of all text
- [ ] Stock image licences (13 files in `assets/stock/`, records in `assets/stock/manifest.json` and in the media library): on 2026-11-12 the Wikimedia Commons API reported licence "CC0" for all 13 file pages listed in the manifest (photographers: Browning, Bieder, Anderson, Venckus, Zolkin, Breather x2, Gold x2, Spratt, Militaru, Marinho, freestocks.org). Status: CC0 per the Commons page only; the original unsplash.com pages could NOT be fetched (site blocks automated access), so the Unsplash-side licence is **to verify**. Unsplash photos uploaded after mid-2017 normally fall under the Unsplash License, not CC0, and Commons CC0 tags on such files are uploader-asserted. Before commercial launch: open each `originalUnsplashUrl` in a browser and confirm the licence shown (CC0 or Unsplash License, both usually allow commercial use but the Unsplash License forbids reselling the photo as-is); keep a dated screenshot. Property/trademark/people releases are not covered by either licence (none of the 13 shows identifiable people). Until confirmed, keep every one flagged « Illustration » and never describe them as BatiNova projects.
