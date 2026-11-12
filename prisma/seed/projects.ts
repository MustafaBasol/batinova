// Projects seed — intentionally a NO-OP (design-frontend).
// No real project exists yet: nothing is seeded, so the site shows an honest empty state on /realisations.
// The owner adds real projects from /admin. Never invent or demo completed projects here.
import type { SeedContext } from "./client";

export async function seedProjects({ log }: SeedContext): Promise<void> {
  log("projects: none seeded on purpose (no verified real projects)");
}
