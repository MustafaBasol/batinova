// Navigation seed (design-frontend). Create-if-missing: a location that already has items is left untouched.
// Page-based items use pageId so they disappear automatically when the page is not public.
import type { SeedContext } from "./client";

type Item = { label: string; path?: string; href?: string; children?: Item[] };

const HEADER: Item[] = [
  { label: "À propos", path: "a-propos" },
  {
    label: "Services",
    path: "services",
    children: [
      { label: "Rénovation", path: "services/renovation" },
      { label: "Extension", path: "services/extension" },
      { label: "Construction", path: "services/construction" },
    ],
  },
  { label: "Réalisations", href: "/realisations" },
  { label: "Notre méthode", path: "notre-methode" },
  {
    label: "Zones d’intervention",
    path: "zones-intervention",
    children: [
      { label: "Île-de-France", path: "zones-intervention/ile-de-france" },
      { label: "Normandie", path: "zones-intervention/normandie" },
      { label: "Manche", path: "zones-intervention/manche" },
    ],
  },
  { label: "Blog", href: "/blog" },
];

const FOOTER_PRIMARY: Item[] = [
  { label: "À propos", path: "a-propos" },
  { label: "Services", path: "services" },
  { label: "Réalisations", href: "/realisations" },
  { label: "Notre méthode", path: "notre-methode" },
  { label: "Zones d’intervention", path: "zones-intervention" },
  { label: "Blog", href: "/blog" },
  { label: "Contact", path: "contact" },
  { label: "Demander un devis", href: "/devis" },
];

const FOOTER_LEGAL: Item[] = [
  { label: "Mentions légales", path: "mentions-legales" },
  { label: "Politique de confidentialité", path: "politique-de-confidentialite" },
];

export async function seedNavigation({ db, log }: SeedContext): Promise<void> {
  const locations = [
    ["HEADER", HEADER],
    ["FOOTER_PRIMARY", FOOTER_PRIMARY],
    ["FOOTER_LEGAL", FOOTER_LEGAL],
  ] as const;
  for (const [location, items] of locations) {
    if ((await db.navItem.count({ where: { location } })) > 0) {
      log(`navigation: ${location} already has items, skipped`);
      continue;
    }
    let order = 0;
    const create = async (it: Item, parentId: string | null) => {
      let pageId: string | null = null;
      if (it.path !== undefined) {
        pageId = (await db.page.findUnique({ where: { path: it.path }, select: { id: true } }))?.id ?? null;
        if (!pageId && !it.href) return; // page missing: skip the item
      }
      const row = await db.navItem.create({
        data: { location, label: it.label, pageId, href: pageId ? null : (it.href ?? null), parentId, sortOrder: order++ * 10 },
      });
      for (const c of it.children ?? []) await create(c, row.id);
    };
    for (const it of items) await create(it, null);
    log(`navigation: ${location} created`);
  }
}
