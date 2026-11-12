// Home — PLACEHOLDER. Owner: design-frontend (replace with the CMS-driven home,
// i.e. getPublishedPageByPath("")).
import { SITE } from "@/lib/config/site";

export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="font-serif text-4xl text-charcoal">{SITE.name}</h1>
      <p className="text-beige text-lg">{SITE.slogan}</p>
      <p className="mt-6 text-sm text-charcoal/70">Site en cours de construction.</p>
    </main>
  );
}
