// Initial form states (plain module: callable from Server Components).
import type { PageFormState } from "./PageEditor";
import type { PostFormState } from "./PostEditor";
import type { ProjectFormState } from "./ProjectEditor";
import type { PageTemplateKey } from "@/lib/cms/constants";

export const emptySeo = () => ({ metaTitle: "", metaDescription: "", ogImageId: null as string | null, noindex: false, canonicalPath: "" });

export const emptyPage = (template: PageTemplateKey = "STANDARD"): PageFormState => ({
  title: "",
  path: "",
  template,
  blocks: [],
  showInNav: false,
  navOrder: 0,
  navLabel: "",
  parentId: null,
  isPlaceholder: false,
  status: { status: "DRAFT", scheduledAt: "" },
  seo: emptySeo(),
});

export const emptyPost = (): PostFormState => ({
  title: "", slug: "", excerpt: "", body: { type: "doc", content: [{ type: "paragraph" }] }, coverImageId: null, categoryId: null, tags: [],
  authorDisplayName: "", isPlaceholder: false, status: { status: "DRAFT", scheduledAt: "" }, seo: emptySeo(),
});

export const emptyProject = (): ProjectFormState => ({
  title: "", slug: "", summary: "", region: "", locationLabel: "", blocks: [], coverImageId: null, sortOrder: 0, isPlaceholder: true,
  gallery: [], pairs: [], status: { status: "DRAFT", scheduledAt: "" }, seo: emptySeo(),
});


import type { BlockData } from "./BlockEditor";
const rid = () => `b${Math.random().toString(36).slice(2, 10)}`;
/** Gives every block a stable editor key (schema field `id`). */
export const withIds = (blocks: BlockData[]): BlockData[] => blocks.map((b) => (b.id ? b : { ...b, id: rid() }));
