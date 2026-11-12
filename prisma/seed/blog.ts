// Blog seed — STUB. Owner: seo-content.
// Create-if-missing only (upsert by slug with update: {}). Post.body is a Tiptap
// JSON doc that must pass validateRichText() (src/lib/richtext/schema.ts).
// Seeded articles: status DRAFT, cover Media with licenseType STOCK_FREE,
// credit + licenseSource, isPlaceholder: true (see docs/CONTENT_REQUIREMENTS.md).
import type { SeedContext } from "./client";

export async function seedBlog({ log }: SeedContext): Promise<void> {
  log("blog: stub (seo-content)");
}
