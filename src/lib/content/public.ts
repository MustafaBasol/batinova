import "server-only";
import { cache } from "react";
import { db } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { parseBlocks, type CmsBlock } from "@/lib/blocks/schema";
import { parseRichText, type RichTextDoc } from "@/lib/richtext/schema";
import { getSettings as getAllSettings } from "@/lib/settings";
import { isSafeHref } from "@/lib/security/href";
import { notDeleted, publishedWhere } from "./publish";
import { pageUrl } from "./paths";

/**
 * Read-only PUBLIC query layer (owner: architect-security; FROZEN signatures).
 * Every function here returns only published, non-deleted content (via
 * publishedWhere) and never exposes admin-only fields (internal notes, author
 * ids, revision data). Public routes, sitemap and feeds MUST use this module
 * instead of querying `db` directly. Admin code uses `db` + guards instead.
 */

export const POSTS_PER_PAGE = 9;

const mediaSelect = {
  id: true,
  storageKey: true,
  mime: true,
  width: true,
  height: true,
  alt: true,
  caption: true,
  credit: true,
  licenseType: true,
  licenseSource: true,
  isPlaceholder: true,
  focalX: true,
  focalY: true,
  variants: true,
} satisfies Prisma.MediaSelect;

export type PublicMedia = Prisma.MediaGetPayload<{ select: typeof mediaSelect }>;

const seoSelect = {
  metaTitle: true,
  metaDescription: true,
  noindex: true,
  canonicalPath: true,
  ogImage: { select: mediaSelect },
} as const;

/** Media is public unless soft-deleted. */
const mediaRel = { where: notDeleted } as const;
void mediaRel;

function cleanMedia(m: (PublicMedia & { deletedAt?: Date | null }) | null | undefined): PublicMedia | null {
  return m ?? null;
}

// ---------------------------------------------------------------- pages

const pageSelect = {
  id: true,
  path: true,
  title: true,
  template: true,
  blocks: true,
  publishedAt: true,
  scheduledAt: true,
  updatedAt: true,
  isPlaceholder: true,
  navLabel: true,
  parent: { select: { path: true, title: true, status: true, deletedAt: true, publishedAt: true, scheduledAt: true } },
  ...seoSelect,
} satisfies Prisma.PageSelect;

type RawPage = Prisma.PageGetPayload<{ select: typeof pageSelect }>;
export type PublicPage = Omit<RawPage, "blocks" | "parent"> & {
  blocks: CmsBlock[];
  parent: { path: string; title: string } | null;
};

function toPublicPage(p: RawPage, now: Date): PublicPage {
  const { blocks, parent, ...rest } = p;
  const parentVisible =
    parent && !parent.deletedAt && isVisibleStatus(parent.status, parent.publishedAt, parent.scheduledAt, now);
  return {
    ...rest,
    ogImage: cleanMedia(p.ogImage),
    blocks: parseBlocks(blocks).blocks,
    parent: parentVisible ? { path: parent.path, title: parent.title } : null,
  };
}

function isVisibleStatus(status: string, publishedAt: Date | null, scheduledAt: Date | null, now: Date) {
  if (status === "PUBLISHED") return !publishedAt || publishedAt <= now;
  if (status === "SCHEDULED") return scheduledAt ? scheduledAt <= now : !!publishedAt && publishedAt <= now;
  return false;
}

/** Page by stored path ("" = home). Returns null if not public. */
export const getPublishedPageByPath = cache(async (path: string): Promise<PublicPage | null> => {
  const now = new Date();
  const page = await db.page.findFirst({ where: { path, ...publishedWhere(now) }, select: pageSelect });
  return page ? toPublicPage(page, now) : null;
});

/** All public pages (sitemap). */
export async function listPublishedPages(): Promise<
  { path: string; title: string; template: string; noindex: boolean; updatedAt: Date; isPlaceholder: boolean }[]
> {
  return db.page.findMany({
    where: publishedWhere(),
    select: { path: true, title: true, template: true, noindex: true, updatedAt: true, isPlaceholder: true },
    orderBy: { path: "asc" },
  });
}

/** Pages flagged showInNav (fallback when NavItem rows are absent). */
export async function listNavPages(): Promise<{ path: string; title: string; label: string; href: string }[]> {
  const rows = await db.page.findMany({
    where: { showInNav: true, ...publishedWhere() },
    select: { path: true, title: true, navLabel: true },
    orderBy: [{ navOrder: "asc" }, { title: "asc" }],
  });
  return rows.map((r) => ({ path: r.path, title: r.title, label: r.navLabel || r.title, href: pageUrl(r.path) }));
}

// ---------------------------------------------------------------- navigation

export type NavLocation = "HEADER" | "FOOTER_PRIMARY" | "FOOTER_LEGAL";

export interface PublicNavItem {
  id: string;
  label: string;
  href: string;
  openInNewTab: boolean;
  children: PublicNavItem[];
}

/**
 * Enabled nav items for a location. Items linked to a page are hidden unless
 * that page is public; free hrefs are re-validated with isSafeHref.
 */
export async function listNavItems(location: NavLocation): Promise<PublicNavItem[]> {
  const now = new Date();
  const rows = await db.navItem.findMany({
    where: { location, enabled: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    select: {
      id: true,
      label: true,
      href: true,
      parentId: true,
      openInNewTab: true,
      page: { select: { path: true, status: true, deletedAt: true, publishedAt: true, scheduledAt: true } },
    },
  });
  const resolved = rows
    .map((r) => {
      let href: string | null = null;
      if (r.page) {
        const visible =
          !r.page.deletedAt && isVisibleStatus(r.page.status, r.page.publishedAt, r.page.scheduledAt, now);
        href = visible ? pageUrl(r.page.path) : null;
      } else if (r.href && isSafeHref(r.href)) {
        href = r.href;
      }
      return href ? { id: r.id, parentId: r.parentId, label: r.label, href, openInNewTab: r.openInNewTab } : null;
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  const byId = new Map<string, PublicNavItem>();
  for (const r of resolved) byId.set(r.id, { id: r.id, label: r.label, href: r.href, openInNewTab: r.openInNewTab, children: [] });
  const roots: PublicNavItem[] = [];
  for (const r of resolved) {
    const item = byId.get(r.id)!;
    const parent = r.parentId ? byId.get(r.parentId) : undefined;
    if (r.parentId && !parent) continue; // parent hidden -> hide child
    (parent ? parent.children : roots).push(item);
  }
  return roots;
}

// ---------------------------------------------------------------- blog

const postListSelect = {
  id: true,
  slug: true,
  title: true,
  excerpt: true,
  publishedAt: true,
  scheduledAt: true,
  updatedAt: true,
  readingMinutes: true,
  authorDisplayName: true,
  isPlaceholder: true,
  coverImage: { select: mediaSelect },
  category: { select: { slug: true, name: true, deletedAt: true } },
} satisfies Prisma.PostSelect;

type RawPostListItem = Prisma.PostGetPayload<{ select: typeof postListSelect }>;
export type PublicPostListItem = Omit<RawPostListItem, "category"> & { category: { slug: string; name: string } | null };

function cleanPostItem<T extends RawPostListItem>(p: T): Omit<T, "category"> & { category: { slug: string; name: string } | null } {
  const { category, ...rest } = p;
  return { ...rest, category: category && !category.deletedAt ? { slug: category.slug, name: category.name } : null };
}

export async function listPublishedPosts(
  opts: { page?: number; perPage?: number; categorySlug?: string; tagSlug?: string } = {},
): Promise<{ items: PublicPostListItem[]; total: number; page: number; pageCount: number }> {
  const perPage = Math.min(Math.max(opts.perPage ?? POSTS_PER_PAGE, 1), 50);
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const where: Prisma.PostWhereInput = {
    ...publishedWhere(),
    ...(opts.categorySlug ? { category: { slug: opts.categorySlug, deletedAt: null } } : {}),
    ...(opts.tagSlug ? { tags: { some: { tag: { slug: opts.tagSlug, deletedAt: null } } } } : {}),
  };
  const [total, items] = await Promise.all([
    db.post.count({ where }),
    db.post.findMany({
      where,
      select: postListSelect,
      orderBy: [{ publishedAt: "desc" }, { scheduledAt: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * perPage,
      take: perPage,
    }),
  ]);
  return { items: items.map(cleanPostItem), total, page, pageCount: Math.max(1, Math.ceil(total / perPage)) };
}

const postDetailSelect = {
  ...postListSelect,
  body: true,
  blocks: true,
  ...seoSelect,
  tags: { select: { tag: { select: { slug: true, name: true, deletedAt: true } } } },
} satisfies Prisma.PostSelect;

type RawPost = Prisma.PostGetPayload<{ select: typeof postDetailSelect }>;
export type PublicPost = Omit<RawPost, "body" | "blocks" | "tags" | "category"> & {
  /** Validated, normalized Tiptap doc (invalid stored docs render empty). */
  body: RichTextDoc;
  blocks: CmsBlock[];
  tags: { slug: string; name: string }[];
  category: { slug: string; name: string } | null;
};

export const getPublishedPostBySlug = cache(async (slug: string): Promise<PublicPost | null> => {
  const post = await db.post.findFirst({ where: { slug, ...publishedWhere() }, select: postDetailSelect });
  if (!post) return null;
  const { blocks, tags, body, ...rest } = cleanPostItem(post);
  return {
    ...rest,
    body: parseRichText(body),
    blocks: parseBlocks(blocks).blocks,
    tags: tags.filter((t) => !t.tag.deletedAt).map((t) => ({ slug: t.tag.slug, name: t.tag.name })),
  };
});

export async function listCategories(): Promise<
  { slug: string; name: string; description: string | null; postCount: number }[]
> {
  const where = publishedWhere();
  const cats = await db.category.findMany({
    where: notDeleted,
    select: { slug: true, name: true, description: true, _count: { select: { posts: { where } } } },
    orderBy: { name: "asc" },
  });
  return cats.map((c) => ({ slug: c.slug, name: c.name, description: c.description, postCount: c._count.posts }));
}

export async function getCategoryBySlug(slug: string) {
  return db.category.findFirst({
    where: { slug, ...notDeleted },
    select: { slug: true, name: true, description: true, ...seoSelect },
  });
}

export async function getTagBySlug(slug: string) {
  return db.tag.findFirst({ where: { slug, ...notDeleted }, select: { slug: true, name: true } });
}

// ---------------------------------------------------------------- projects

const projectListSelect = {
  id: true,
  slug: true,
  title: true,
  summary: true,
  region: true,
  locationLabel: true,
  publishedAt: true,
  updatedAt: true,
  isPlaceholder: true,
  coverImage: { select: mediaSelect },
} satisfies Prisma.ProjectSelect;

export type PublicProjectListItem = Prisma.ProjectGetPayload<{ select: typeof projectListSelect }>;

export async function listPublishedProjects(
  opts: { region?: "ILE_DE_FRANCE" | "NORMANDIE" | "MANCHE"; limit?: number } = {},
): Promise<PublicProjectListItem[]> {
  return db.project.findMany({
    where: { ...publishedWhere(), ...(opts.region ? { region: opts.region } : {}) },
    select: projectListSelect,
    orderBy: [{ sortOrder: "asc" }, { publishedAt: "desc" }],
    take: Math.min(Math.max(opts.limit ?? 100, 1), 100),
  });
}

const projectDetailSelect = {
  ...projectListSelect,
  blocks: true,
  ...seoSelect,
  media: {
    where: { media: notDeleted },
    orderBy: { sortOrder: "asc" },
    select: { role: true, sortOrder: true, media: { select: mediaSelect } },
  },
} satisfies Prisma.ProjectSelect;

type RawProject = Prisma.ProjectGetPayload<{ select: typeof projectDetailSelect }>;
export type PublicProject = Omit<RawProject, "blocks"> & { blocks: CmsBlock[] };

export const getPublishedProjectBySlug = cache(async (slug: string): Promise<PublicProject | null> => {
  const p = await db.project.findFirst({ where: { slug, ...publishedWhere() }, select: projectDetailSelect });
  return p ? { ...p, blocks: parseBlocks(p.blocks).blocks } : null;
});

// ---------------------------------------------------------------- media & settings

export const getMediaById = cache(async (id: string): Promise<PublicMedia | null> => {
  return db.media.findFirst({ where: { id, ...notDeleted }, select: mediaSelect });
});

/** Batch lookup; returns a Map keyed by id (missing / deleted ids are absent). */
export async function getMediaByIds(ids: readonly string[]): Promise<Map<string, PublicMedia>> {
  const unique = [...new Set(ids)].slice(0, 200);
  if (unique.length === 0) return new Map();
  const rows = await db.media.findMany({ where: { id: { in: unique }, ...notDeleted }, select: mediaSelect });
  return new Map(rows.map((m) => [m.id, m]));
}

/** Public settings (same object as admin; never contains secrets). */
export const getSettings = getAllSettings;
