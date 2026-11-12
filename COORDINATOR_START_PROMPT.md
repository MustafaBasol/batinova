# BatiNova — coordinator execution prompt

You are the coordinator for the **BatiNova Construction** website project. Treat `CLAUDE.md`, `docs/PRODUCT_BRIEF.md`, `docs/SEO_AND_CONTENT.md`, `docs/PHASE_PLAN.md` and `.claude/agents/*.md` as authoritative project instructions. Logo: `assets/batinova-logo-reference.jpeg`.

**Mission:** Implement a high-quality French-language, SEO-first, premium minimalist construction company website at **btnv.fr**, including secure self-service CMS for pages, blog, media, portfolio and quote leads, from the existing repository state (or initialize correctly if empty). Brand slogan **Construire autrement.** Base address **4 rue des Lilas, 93600 Aulnay-sous-Bois, France**. Service regions **Île-de-France** and **Normandie**, specifically **Manche**. Use charcoal and beige logo palette. Preserve premium architectural feel, speed and accessibility.

## Mandatory orchestration
1. Start with `git status`, current branch, minimal directory listing and targeted configuration inspection. Determine whether repository already exists / what works. Do not rewrite working modules unnecessarily. **Use CodeGraph for targeted queries in only the relevant source root and subdirectories for the files you will touch; never scan the whole repository** unless specific justification. Keep token usage low.
2. Spawn and coordinate specialist agents: `architect-security`, `design-frontend`, `cms-admin`, `seo-content`, `qa-release`. Parallelize only independent scopes; communicate shared interface contracts and file ownership. Use cost-effective models appropriate for tasks; keep highest reasoning for auth, database/security and integration decisions.
3. Work across all five phases in `docs/PHASE_PLAN.md` in this single execution as far as available environment permits. Do not stop merely to ask permission between ordinary development phases. If external secrets, real business info or access is missing, implement safe config/placeholders and document blockers rather than guess or defer unrelated code.
4. Implement full SEO for CMS-created dynamic content: French SSR metadata, crawlability, canonical, sitemap, robots, location page uniqueness, JSON-LD factual accuracy, redirects, preview/draft nonindex, image ALT and content editor SEO controls. Do **not** create thin city doorway pages or claim a Normandie office. Blog owner should be able to publish independently.
5. Build `/admin` with secure OWNER/EDITOR access, editing pages with controlled blocks, blog/articles/categories/tags, portfolios/media with alt/licensing, quote lead inbox, settings and SEO. Ensure authentication and authorization are checked server-side, uploads safe, and contact data handled appropriately.
6. Configure only suggested email routing identities (`contact@btnv.fr`, `devis@btnv.fr`, `projets@btnv.fr`, `direction@btnv.fr`, `privacy@btnv.fr`) as **unprovisioned defaults**, not functioning mailboxes. Never change MX/SPF/DKIM/DMARC or send mail without verified setup.
7. Use only real company/project claims verified by owner. Logo supplied is real brand reference; any other images or projects must be correctly licensed and clearly flagged demo placeholders until owner validation. Never invent legal identifiers, insurance, ratings, customer references, numbers or credentials.
8. At each phase, run focused tests and typechecks, then full feasible integration/build/e2e checks at final gate. Resolve failures that are within scope. Do not claim cloud CI passed if not run.

## Strict boundaries
**Do not open a PR**, merge, deploy, mutate production, edit live DNS or email, force-push, or change external services. You may create a feature branch, commit and push only if repository access and user-established convention allow it; otherwise keep safe local commits and report exact state. Wait for my separate PR command. Do not automatically purchase imagery or services.

## Final report format (Turkish)
A. Outcome: READY_FOR_PR / BLOCKED with reason.
B. Git: branch/base/current SHA, clean/dirty, push state, no PR opened.
C. Phase-by-phase delivered features and changed paths.
D. Tests (exact commands, passed/failed/skipped), security/accessibility/SEO evidence.
E. Unverified content and external dependencies (legal entity, phone, insurance, photos, DNS/mail, hosting).
F. Exact next actions for me, with safe batched verification commands and separate confirmation gates for risky steps.

Begin implementation now; do not open a PR.
