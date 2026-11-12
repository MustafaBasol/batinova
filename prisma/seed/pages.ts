// Pages seed — STUB. Owner: design-frontend.
// Create-if-missing only: db.page.upsert({ where: { path }, create: {...}, update: {} }).
// Demo copy must set isPlaceholder: true and include a placeholderNotice block.
// Home page path is "" (empty string). Services = template SERVICE.
import type { SeedContext } from "./client";

export async function seedPages({ log }: SeedContext): Promise<void> {
  log("pages: stub (design-frontend)");
}
