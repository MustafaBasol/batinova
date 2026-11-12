# Content requirements (owner directives, coordinator-maintained)

## Brand assets (owner request 2026-11-12)
Official web assets derived from the official logo: `assets/branding/logo_batinova_construction.png` (colour, primary), `logo_batinova_monochrome.png` (alternative on light/beige), `icone_batinova_minimaliste.png` (square icon). All verified RGBA with transparent background (2172×724, 2172×724, 1254×1254). `assets/batinova-logo-reference.jpeg` stays as source of truth. Dark backgrounds use a pure recolour (#F5F2EC) of the monochrome alpha mask. Favicons 16/32/48 (+ICO), Apple touch 180 (opaque #F5F2EC), manifest 192/512 + maskable 512, default OG 1200×630. Never stretch, crop artwork or redraw. Admin: settings `branding.{logoMediaId,logoMonoMediaId,logoOnDarkMediaId}` override (null = official). Organization JSON-LD `logo` uses the PNG colour logo (`ORG_LOGO` in `src/components/site/brand-assets.ts`).

## Rich text editor (owner request 2026-11-12)
Blog articles (and the page `richText` block) use a WYSIWYG editor, not raw Markdown. Implementation: Tiptap (ProseMirror) editor in /admin, content stored as Tiptap JSON (`Post.body Json`), rendered on the public site by a server-side React renderer with a strict node/mark whitelist (no `dangerouslySetInnerHTML`, no raw HTML import; pasted HTML is normalised by the editor schema and re-validated server-side with zod before save).
Toolbar (French labels + tooltips), all basic options:
- Annuler / Rétablir; paragraphe; titres H2, H3, H4 (H1 reserved for the article title — SEO)
- Gras, italique, souligné, barré, exposant/indice optional, effacer la mise en forme
- Taille du texte: preset scale only (Petit / Normal / Grand / Très grand) mapped to CSS classes — no arbitrary px, keeps design and accessibility consistent
- Couleur du texte and surlignage: brand palette only (antracite, bej, gris foncé, defaults) with contrast-safe choices
- Alignement (gauche, centré, droite, justifié)
- Listes à puces / numérotées, citation, ligne de séparation, bloc « encadré / à retenir »
- Liens (validated: https, http, mailto, tel, relative; external links get `rel="noopener noreferrer"`; option nofollow), with edit/remove
- Image inside text from the media library (alt required, caption optional, size small/medium/full)
- Tableau simple (optional if time permits)
- Word count + estimated reading time; character counters on SEO fields
Server validation rejects unknown nodes/marks, `javascript:`/`data:` URLs, and style attributes outside the whitelisted presets. XSS tests required.

## Blog — initial articles (owner request 2026-11-12)
- Seed exactly 3 original French articles about the sector (minimum), in addition to the editorial outlines. Suggested topics (pick 3, aligned with stated scope: rénovation, construction, extension, budget planning, regional projects):
  1. Préparer un projet de rénovation de maison : les étapes clés
  2. Extension de maison : les questions à se poser avant de se lancer
  3. Planifier son budget travaux : les postes à anticiper
- Each article MUST have a cover image (and may include in-body image blocks):
  - Image sourced from Unsplash/Pexels (or other verified free licence), downloaded once, optimised (AVIF/WebP variants, sensible max width ~2000px), stored through the media pipeline as a `Media` row with `licenseType=STOCK_FREE`, `credit`, `licenseSource` URL, `isPlaceholder=true` (illustration, never presented as a BatiNova project).
  - Image SEO: descriptive French `alt` text (describes the image, no keyword stuffing), descriptive kebab-case French filename, explicit width/height, responsive `sizes`, cover used as OG image, included in Article JSON-LD `image`.
- No unverified prices, durations, regulations or guarantees. Use cautious, advisory wording ("selon votre projet", "à vérifier auprès de votre mairie").
- Status: seeded as DRAFT (directive 001: initial content reviewed by owner before publication). Owner publishes from /admin in one click. (If the owner asks, coordinator may switch to PUBLISHED.)
- ALL articles — including seeded/AI-written ones — must be fully editable in /admin (title, slug, body, cover image, alt, SEO fields), unpublishable (PUBLISHED → DRAFT/ARCHIVED), and soft-deletable with restore. Seeded posts must not be special-cased or locked; seeding is idempotent and must never overwrite owner edits on re-run (create-if-missing only).
