/**
 * CMS block contract (owner: architect-security; FROZEN for Phase 2-4).
 * - Page.blocks / Project.blocks / Post.blocks store `CmsBlock[]` as JSON.
 * - Renderers (design-frontend) switch on `block.type`.
 * - The admin editor (cms-admin) validates with `BlocksSchema` before saving
 *   and uses `BLOCK_TYPES` for labels/defaults.
 * - Public rendering MUST go through `parseBlocks()` which drops invalid blocks.
 * Additive changes only (new optional fields / new block types); never rename.
 * Rich text = whitelisted Tiptap JSON (src/lib/richtext/schema.ts); other long
 * text fields are PLAIN TEXT (line breaks preserved, no Markdown, no HTML).
 */
import { z } from "zod";
import { isSafeHref } from "@/lib/security/href";
import { RichTextDocSchema, collectRichTextMediaIds } from "@/lib/richtext/schema";

const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).optional();
const href = z
  .string()
  .trim()
  .max(2048)
  .refine((h) => isSafeHref(h), { message: "Lien non autorisé (chemin relatif, https:, mailto: ou tel: uniquement)" });
const id = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/, "Identifiant invalide");
/** Plain multi-line text (rendered as text with line breaks; no Markdown / HTML). */
const plain = (max: number) => z.string().trim().max(max);
/** Optional stable client id for editor keys / anchors. */
const blockId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,40}$/)
  .optional();
const regionEnum = z.enum(["ILE_DE_FRANCE", "NORMANDIE", "MANCHE"]);

export const HeroBlock = z
  .object({
    type: z.literal("hero"),
    id: blockId,
    eyebrow: optText(80),
    heading: text(160),
    subheading: optText(400),
    imageId: id.optional(),
    ctaLabel: optText(60),
    ctaHref: href.optional(),
  })
  .refine((b) => !b.ctaLabel || !!b.ctaHref, {
    message: "ctaHref requis si ctaLabel est défini",
    path: ["ctaHref"],
  });

export const RichTextBlock = z.object({ type: z.literal("richText"), id: blockId, doc: RichTextDocSchema });

export const ImageBlock = z.object({ type: z.literal("image"), id: blockId, mediaId: id, caption: optText(300) });

export const GalleryBlock = z.object({
  type: z.literal("gallery"),
  id: blockId,
  heading: optText(160),
  mediaIds: z.array(id).min(1).max(40),
});

export const CtaBandBlock = z.object({
  type: z.literal("ctaBand"),
  id: blockId,
  heading: text(160),
  text: optText(400),
  label: text(60),
  href,
});

const titledItem = z.object({ title: text(120), text: plain(1_500) });

export const FeaturesBlock = z.object({
  type: z.literal("features"),
  id: blockId,
  heading: optText(160),
  items: z.array(titledItem).min(1).max(12),
});

export const StepsBlock = z.object({
  type: z.literal("steps"),
  id: blockId,
  heading: optText(160),
  items: z.array(titledItem).min(1).max(12),
});

export const FaqBlock = z.object({
  type: z.literal("faq"),
  id: blockId,
  heading: optText(160),
  items: z
    .array(z.object({ question: text(300), answer: plain(3_000) }))
    .min(1)
    .max(30),
});

export const ProjectsGridBlock = z.object({
  type: z.literal("projectsGrid"),
  id: blockId,
  heading: optText(160),
  limit: z.number().int().min(1).max(24).default(6),
  region: regionEnum.optional(),
});

export const PostsGridBlock = z.object({
  type: z.literal("postsGrid"),
  id: blockId,
  heading: optText(160),
  limit: z.number().int().min(1).max(24).default(3),
  categorySlug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100)
    .optional(),
});

export const ZonesBlock = z.object({
  type: z.literal("zones"),
  id: blockId,
  heading: optText(160),
  intro: plain(2_000).optional(),
});

export const ContactFormBlock = z.object({
  type: z.literal("contactForm"),
  id: blockId,
  heading: optText(160),
  /** Optional lead `source` tag, e.g. "service:renovation". */
  source: z
    .string()
    .regex(/^[a-z0-9:_-]{1,60}$/)
    .optional(),
});

export const PlaceholderNoticeBlock = z.object({
  type: z.literal("placeholderNotice"),
  id: blockId,
  text: text(500),
});

export const BlockSchema = z.discriminatedUnion("type", [
  HeroBlock,
  RichTextBlock,
  ImageBlock,
  GalleryBlock,
  CtaBandBlock,
  FeaturesBlock,
  StepsBlock,
  FaqBlock,
  ProjectsGridBlock,
  PostsGridBlock,
  ZonesBlock,
  ContactFormBlock,
  PlaceholderNoticeBlock,
]);

export const MAX_BLOCKS = 60;
/** Strict schema for saving (admin): any invalid block fails the whole save. */
export const BlocksSchema = z.array(BlockSchema).max(MAX_BLOCKS);

export type CmsBlock = z.infer<typeof BlockSchema>;
export type CmsBlockType = CmsBlock["type"];
export type BlockOf<T extends CmsBlockType> = Extract<CmsBlock, { type: T }>;
export type HeroBlockData = BlockOf<"hero">;
export type RichTextBlockData = BlockOf<"richText">;
export type ImageBlockData = BlockOf<"image">;
export type GalleryBlockData = BlockOf<"gallery">;
export type CtaBandBlockData = BlockOf<"ctaBand">;
export type FeaturesBlockData = BlockOf<"features">;
export type StepsBlockData = BlockOf<"steps">;
export type FaqBlockData = BlockOf<"faq">;
export type ProjectsGridBlockData = BlockOf<"projectsGrid">;
export type PostsGridBlockData = BlockOf<"postsGrid">;
export type ZonesBlockData = BlockOf<"zones">;
export type ContactFormBlockData = BlockOf<"contactForm">;
export type PlaceholderNoticeBlockData = BlockOf<"placeholderNotice">;

export interface DroppedBlock {
  index: number;
  type: string | null;
  reason: string;
}

export interface ParsedBlocks {
  blocks: CmsBlock[];
  dropped: DroppedBlock[];
}

/**
 * Lenient parse for rendering: keeps valid blocks, drops invalid ones with a
 * reason (never throws). Non-array input yields no blocks.
 */
export function parseBlocks(input: unknown): ParsedBlocks {
  if (!Array.isArray(input)) {
    return {
      blocks: [],
      dropped: input == null ? [] : [{ index: -1, type: null, reason: "blocks is not an array" }],
    };
  }
  const blocks: CmsBlock[] = [];
  const dropped: DroppedBlock[] = [];
  input.slice(0, MAX_BLOCKS).forEach((raw: unknown, index) => {
    const type =
      raw && typeof raw === "object" && typeof (raw as { type?: unknown }).type === "string"
        ? (raw as { type: string }).type
        : null;
    const res = BlockSchema.safeParse(raw);
    if (res.success) blocks.push(res.data);
    else {
      const issue = res.error.issues[0];
      dropped.push({
        index,
        type,
        reason: issue ? `${issue.path.join(".") || "block"}: ${issue.message}` : "invalid block",
      });
    }
  });
  if (input.length > MAX_BLOCKS) {
    dropped.push({ index: MAX_BLOCKS, type: null, reason: `more than ${MAX_BLOCKS} blocks` });
  }
  return { blocks, dropped };
}

/** Admin editor registry: French labels, descriptions and minimal defaults (defaults may need completion before they validate). */
export const BLOCK_TYPES: Record<CmsBlockType, { label: string; description: string; defaults: Record<string, unknown> }> = {
  hero: { label: "Bandeau d’accueil", description: "Grand titre, sous-titre, image et appel à l’action", defaults: { type: "hero", heading: "" } },
  richText: { label: "Texte", description: "Texte mis en forme (titres, listes, liens, images)", defaults: { type: "richText", doc: { type: "doc", content: [{ type: "paragraph" }] } } },
  image: { label: "Image", description: "Une image de la médiathèque avec légende", defaults: { type: "image", mediaId: "" } },
  gallery: { label: "Galerie", description: "Plusieurs images de la médiathèque", defaults: { type: "gallery", mediaIds: [] } },
  ctaBand: {
    label: "Bandeau d’appel à l’action",
    description: "Incitation (ex. demander un devis)",
    defaults: { type: "ctaBand", heading: "Un projet ?", label: "Demander un devis", href: "/contact" },
  },
  features: { label: "Points forts", description: "Liste d’atouts ou de prestations", defaults: { type: "features", items: [] } },
  steps: { label: "Étapes", description: "Méthode ou déroulé en étapes", defaults: { type: "steps", items: [] } },
  faq: { label: "Questions fréquentes", description: "Questions / réponses", defaults: { type: "faq", items: [] } },
  projectsGrid: { label: "Réalisations", description: "Grille de réalisations publiées", defaults: { type: "projectsGrid", limit: 6 } },
  postsGrid: { label: "Articles", description: "Derniers articles du blog", defaults: { type: "postsGrid", limit: 3 } },
  zones: { label: "Zones d’intervention", description: "Île-de-France, Normandie, Manche (siège unique)", defaults: { type: "zones" } },
  contactForm: { label: "Formulaire de contact", description: "Formulaire de demande de devis", defaults: { type: "contactForm" } },
  placeholderNotice: {
    label: "Mention « contenu de démonstration »",
    description: "Signale un contenu provisoire",
    defaults: { type: "placeholderNotice", text: "Contenu de démonstration — à remplacer avant publication." },
  },
};

/** Collect media ids referenced by blocks (for preloading / usage checks). */
export function collectMediaIds(blocks: readonly CmsBlock[]): string[] {
  const ids = new Set<string>();
  for (const b of blocks) {
    if (b.type === "hero" && b.imageId) ids.add(b.imageId);
    if (b.type === "image") ids.add(b.mediaId);
    if (b.type === "gallery") b.mediaIds.forEach((m) => ids.add(m));
    if (b.type === "richText") collectRichTextMediaIds(b.doc).forEach((m) => ids.add(m));
  }
  return [...ids];
}
