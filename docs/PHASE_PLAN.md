# Phase plan and merge gates

0. Recon: inspect repository, logo dimensions, exact stack, dependencies and tooling; CodeGraph only focused paths. Decide and document assumptions. No production touches.
1. Foundation: project skeleton or adaptation, types, configuration, schema and migrations, login/RBAC, media storage contract, CI/test bootstrap. Gate: clean boot/auth tests.
2. Site: premium French design, core public routes, editable site settings, hero, quote CTAs, mobile and accessibility. Gate: responsive check.
3. CMS: owner/editor admin for pages/blog/media/projects, drafts, revisions, publish/preview, contact leads; validation and auth tests. Gate: owner can manage content independently.
4. SEO: dynamic meta, sitemap, robots, structured data, redirects, regional content with no doorway pages, editorial outlines, on-page checks. Gate: published vs draft crawl behavior.
5. QA: cross-module tests, security abuse tests, performance/accessibility check, legal and owner content blockers, staged verification runbook. Gate: READY_FOR_PR or BLOCKED with evidence. NO PR OPENING.

Each phase report: paths, commits/branch, targeted tests/results, caveats, local commands, next user action. Coordinator can overlap independent tasks, but avoid parallel edits to shared files or schema; announce ownership boundaries first.
