# Editorial plan (seo-content)

Scope: blog topics aligned with the **confirmed** offer only (rénovation, extension, construction) and the **confirmed** zones (Île-de-France, Normandie, dont la Manche), written to be useful first ([Google: helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)). Nothing here asserts search volumes, rankings, project facts, prices, durations, regulations or guarantees. "Target query" lines are **hypotheses about intent** to be validated with Search Console / Keyword Planner (record tool + date next to any number later).

## Rules for every article
- Original French, neutral expert voice, practical structure (H1 = title, H2/H3), one « À retenir » callout, internal links to a service page, a zone page where relevant, `/devis`, and 1-2 related articles.
- No figures (prices, durations, percentages), no regulatory thresholds stated as fact: say "renseignez-vous auprès du service urbanisme de votre mairie" and link to official sources (service-public.fr, France Rénov').
- No invented experience, clients, projects, certifications, insurance or reviews. First-person claims of experience only after the owner supplies verified facts.
- Region sections add information only if it is true and specific; otherwise they are omitted. Never duplicate the same text for several regions.
- Cover image: descriptive French alt, caption/credit, flagged placeholder when it is stock. Meta title short (brand adds about 23 characters), meta description about 150 characters.
- Seeded and AI-assisted drafts are reviewed and edited by the owner before publication (status DRAFT).

## Already written (seeded as DRAFT, `prisma/seed/blog.ts`)
1. Préparer un projet de rénovation de maison : les étapes clés (`conseils-renovation`)
2. Extension de maison : les questions à se poser avant de se lancer (`construction`)
3. Planifier son budget travaux : les postes à anticiper (`budget-travaux`)

## Planned outlines (7)

### 1. Choisir une entreprise de rénovation ou de construction en Île-de-France
- Category / service: `demarches` / rénovation, extension, construction. Zone: Île-de-France.
- Intent: informational-commercial, prospect comparing contractors.
- Target query (hypothesis): "comment choisir une entreprise de rénovation en Île-de-France", "choisir un constructeur de maison".
- H2 outline: Définir son besoin avant de consulter · Les documents à demander (attestations d'assurance en cours de validité, références vérifiables) · Lire un devis détaillé · Poser les bonnes questions lors du rendez-vous · Contrat, calendrier, modalités de paiement · Signaux d'alerte · Contraintes propres au chantier en zone dense (accès, copropriété, voisinage) · À retenir.
- Internal links: `/services/renovation`, `/services/construction`, `/zones-intervention/ile-de-france`, `/devis`, article « budget travaux », article « étapes clés ».
- Region relevance: contraintes de chantier en zone dense, uniquement si validées par l'équipe. No claim about how BatiNova compares with others.
- Owner input: none required for the generic checklist; do not state BatiNova's own insurance or qualifications until verified.

### 2. Planifier des travaux en Normandie : ce qu'il faut anticiper
- Category / service: `conseils-renovation` / rénovation, extension. Zone: Normandie.
- Intent: informational, owner of a house or second home in Normandie planning works from Île-de-France or locally.
- Target query (hypothesis): "travaux maison Normandie par où commencer", "rénovation maison normande".
- H2 outline: Le bâti rencontré (variété du bâti ancien et récent, à illustrer seulement avec des exemples vérifiés) · Organiser un chantier à distance (visites, points réguliers, accès, clés) · Saison et météo : planifier sans promettre de dates · Approvisionnement et disponibilité des entreprises (sans généralités non vérifiées) · Urbanisme local : s'adresser à la mairie / au service instructeur · À retenir.
- Internal links: `/zones-intervention/normandie`, `/services/renovation`, `/services/extension`, `/devis?type=renovation`, article « étapes clés ».
- Region relevance: the only article specific to Normandie in general; Manche gets its own distinct angle (outline 3).
- Owner input REQUIRED: real knowledge of working in Normandie (organisation of site visits from Aulnay-sous-Bois). Do not publish with generic text; if no genuine content exists, enrich the zone page instead.

### 3. Rénover dans la Manche : planification et contraintes locales
- Category / service: `conseils-renovation` / rénovation. Zone: Manche (Normandie).
- Intent: informational, owners of a house in the Manche (principal or secondary residence).
- Target query (hypothesis): "rénovation maison Manche", "travaux maison bord de mer Manche".
- H2 outline: Un climat et un environnement à prendre en compte (humidité, vent, embruns : principes généraux, à valider par un professionnel) · Matériaux et finitions adaptés à l'exposition (principes, pas de recommandation de marque) · Bâti en pierre et couvertures traditionnelles (précautions, diagnostic préalable) · Protections patrimoniales et règles locales : se renseigner en mairie · Calendrier de chantier et accès · À retenir.
- Internal links: `/zones-intervention/manche`, `/zones-intervention/normandie`, `/services/renovation`, `/devis`, article « étapes clés ».
- Region relevance: must contain content that outline 2 does not (avoid doorway duplication). If both cannot be made distinct and useful, merge into one article.
- Owner input REQUIRED: genuine local knowledge; technical review by a professional; no invented local projects.

### 4. Les facteurs qui font varier le coût d'une rénovation structurelle
- Category / service: `budget-travaux` / rénovation (reprise de structure, ouverture de murs, toiture).
- Intent: informational, early budgeting.
- Target query (hypothesis): "ce qui fait varier le prix d'une rénovation", "budget rénovation lourde".
- H2 outline: Pourquoi un devis ne ressemble jamais à un autre · L'état initial du bâtiment · La nature des interventions (porteurs, charpente, fondations, réseaux) · L'accès, la logistique et les protections · Les études et contrôles · Les finitions et les niveaux de gamme · Imprévus et marges · Comment demander des devis comparables · À retenir.
- Internal links: `/services/renovation`, article « budget travaux » (hub), article « étapes clés », `/devis?type=renovation`.
- Region relevance: none forced (factors are general); mention locale seulement si l'équipe peut l'étayer.
- Constraint: no figures at all.

### 5. Permis, déclaration préalable, assurances : vue d'ensemble avant un chantier
- Category / service: `demarches` / extension, rénovation, construction.
- Intent: informational, "what do I need to do before starting".
- Target query (hypothesis): "déclaration préalable ou permis de construire pour une extension", "assurance chantier particulier".
- H2 outline: Pourquoi les démarches conditionnent le calendrier · Comment savoir ce dont son projet a besoin (document d'urbanisme, mairie, service instructeur : où chercher, sans seuils chiffrés) · Les pièces d'un dossier (à titre général) · Copropriété, lotissement, secteurs protégés · Assurances liées à un chantier : lesquelles demander à l'entreprise, lesquelles vérifier de son côté (principes, renvoi vers les sources officielles) · Après l'autorisation : affichage, ouverture de chantier, achèvement (renvoi aux sources officielles) · À retenir.
- Internal links: `/services/extension`, `/services/construction`, article « extension de maison », article « budget travaux », `/devis`, `/contact`.
- Region relevance: aucune règle régionale affirmée; chaque commune a son propre document d'urbanisme.
- Owner/legal review REQUIRED before publication (legal accuracy). Sources: service-public.fr, Ministère chargé de l'urbanisme.

### 6. Construire une maison neuve : de la lecture du terrain à la remise des clés
- Category / service: `construction` / construction.
- Intent: informational, early-stage project.
- Target query (hypothesis): "étapes construction maison individuelle", "avant d'acheter un terrain à bâtir".
- H2 outline: Définir le programme (pièces, usages, évolutions) · Lire un terrain (orientation, sol, pente, réseaux, règles locales) · Concevoir : qui fait quoi · Budget global au-delà du chantier · Autorisations à anticiper · Consulter et comparer · Suivi de chantier et réception · À retenir.
- Internal links: `/services/construction`, `/zones-intervention/ile-de-france`, `/zones-intervention/normandie`, article « budget travaux », article « permis et assurances », `/devis?type=construction`.
- Region relevance: brève section « Île-de-France / Normandie : ce qui peut changer » (nature du foncier, règles locales), sans chiffres ni affirmations de marché.

### 7. Retour de chantier : modèle de fiche (à n'utiliser qu'avec une vraie réalisation)
- Category / service: `realisations` / rénovation, extension ou construction selon le chantier.
- Intent: proof of work for prospects who want to see concrete results.
- Target query (hypothesis): none; page de preuve qui renforce les pages de service et de zone.
- H2 outline (template): Le contexte et la demande du client (avec son accord) · Les contraintes du bâti et du site · Les choix techniques et pourquoi · Le déroulement du chantier · Le résultat (photos avant/après réelles, alt descriptifs) · Ce que le projet apprend (sans chiffres non vérifiés).
- Internal links: service concerné, zone concernée, `/devis`, projet correspondant dans `/realisations`.
- Region relevance: the project's real location, only if the client and owner agree.
- Hard rule: never created from stock photos or invented cases. Requires written client consent, owner-verified facts and real photos (`isPlaceholder=false`). Until then the `realisations` category stays empty and unlisted.

## Suggested order and cadence
Publish the three seeded articles first (together, they link to each other), then outlines 4, 5, 6 (generic, can be written without local proof), then 1. Outlines 2, 3 and 7 depend on genuine owner input: do not publish them as filler. No fixed publication frequency is promised; quality and accuracy come first.

## Measurement (after indexing, owner-run)
Search Console: indexed pages vs submitted, queries and pages per article, click-through, then refresh titles/descriptions or content that attracts impressions but few clicks. Record each change and date. No SEO score is used as a goal.
