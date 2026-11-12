import { expect, test, type APIRequestContext } from "@playwright/test";
import { queryDatabase } from "../support/mysql";
import { creds, login, newClientContext } from "./helpers";

/**
 * SEO, content integrity, link crawl, redirects/410 and privacy defaults against the PRODUCTION build
 * (NODE_ENV=production, SITE_URL=https://btnv.fr, SITE_INDEXING=true — see start-server.mjs).
 */
const SITE = "https://btnv.fr";
const toLocal = (u: string) => u.replace(SITE, "");

// Read-only access to the isolated E2E MySQL test database (URL written by start-server.mjs).
const q = <T,>(sql: string, params: unknown[] = []) => queryDatabase<T>(creds.databaseUrl, sql, params);

function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#x27;|&#39;|&rsquo;/g, "’")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}
const meta = (html: string, attr: "name" | "property", key: string) => {
  const m = html.match(new RegExp(`<meta[^>]*${attr}="${key}"[^>]*content="([^"]*)"`, "i")) ?? html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*${attr}="${key}"`, "i"));
  return m?.[1];
};
const robotsMetas = (html: string) => [...html.matchAll(/<meta[^>]*name="robots"[^>]*content="([^"]*)"/gi)].map((m) => m[1]!).join(",");
const jsonLd = (html: string): Record<string, unknown>[] =>
  [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]!) as Record<string, unknown>);
const walk = (v: unknown, fn: (k: string, val: unknown) => void) => {
  if (Array.isArray(v)) v.forEach((x) => walk(x, fn));
  else if (v && typeof v === "object") for (const [k, val] of Object.entries(v)) { fn(k, val); walk(val, fn); }
};

async function html(request: APIRequestContext, p: string) {
  const res = await request.get(p, { maxRedirects: 0 });
  return { status: res.status(), body: await res.text(), headers: res.headers() };
}

test.describe("metadata, canonical, Open Graph, structured data", () => {
  const cases: [string, string][] = [["home", "/"], ["service", "/services/renovation"], ["zone", "/zones-intervention/manche"], ["contact", "/contact"]];
  for (const [label, p] of cases) {
    test(`${label} (${p}): title, description, canonical, OG, Twitter, lang`, async ({ request }) => {
      const { status, body, headers } = await html(request, p);
      expect(status).toBe(200);
      expect(body).toMatch(/<html lang="fr"/);
      const title = body.match(/<title>([^<]+)<\/title>/)?.[1] ?? "";
      expect(title.length).toBeGreaterThan(10);
      expect(title.length, `title too long: ${title}`).toBeLessThanOrEqual(75);
      const desc = meta(body, "name", "description") ?? "";
      expect(desc.length).toBeGreaterThan(50);
      expect(desc.length).toBeLessThanOrEqual(170);
      const canonical = body.match(/<link rel="canonical" href="([^"]+)"/)?.[1];
      expect(canonical).toBe(p === "/" ? SITE : `${SITE}${p}`);
      expect(meta(body, "property", "og:url")).toBe(canonical);
      expect(meta(body, "property", "og:title")).toBeTruthy();
      expect(meta(body, "property", "og:description")).toBeTruthy();
      expect(meta(body, "property", "og:locale")).toBe("fr_FR");
      expect(meta(body, "property", "og:site_name")).toBeTruthy();
      expect(meta(body, "property", "og:image")).toMatch(/^https:\/\/btnv\.fr\//);
      expect(meta(body, "name", "twitter:card")).toBeTruthy();
      expect(body.match(/<h1/g)?.length).toBe(1);
      // placeholder / noindex content must be noindex even with SITE_INDEXING=true
      const row = (await q<{ isPlaceholder: number; noindex: number }>("select isPlaceholder, noindex from Page where path = ?", [p === "/" ? "" : p.slice(1)]))[0];
      const robots = robotsMetas(body);
      if (row && (row.isPlaceholder || row.noindex)) expect(robots, "placeholder/noindex page must carry noindex").toContain("noindex");
      else expect(robots).not.toContain("noindex");
      expect(headers["x-content-type-options"]).toBe("nosniff");
    });
  }

  test("structured data: valid JSON, only factual fields, single head-office address, no ratings/reviews/phone/prices", async ({ request }) => {
    const forbiddenKeys = ["aggregateRating", "review", "reviews", "rating", "telephone", "priceRange", "foundingDate", "taxID", "vatID", "openingHours", "openingHoursSpecification", "geo", "employee", "award", "hasCredential", "offers", "makesOffer", "numberOfEmployees", "location"];
    const sm = await (await request.get("/sitemap.xml")).text();
    const urls = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => toLocal(m[1]!));
    expect(urls.length).toBeGreaterThan(5);
    const addresses = new Set<string>();
    for (const u of urls) {
      const { body } = await html(request, u || "/");
      for (const doc of jsonLd(body)) {
        walk(doc, (k, v) => {
          expect(forbiddenKeys, `${u}: forbidden JSON-LD key ${k}`).not.toContain(k);
          if (k === "address" && v && typeof v === "object") addresses.add(JSON.stringify(v));
        });
      }
    }
    // one address only, equal to the owner-supplied base address
    expect([...addresses].length).toBeLessThanOrEqual(1);
    for (const a of addresses) {
      const o = JSON.parse(a) as Record<string, string>;
      expect(o.streetAddress).toBe("4 rue des Lilas");
      expect(o.postalCode).toBe("93600");
      expect(o.addressLocality).toBe("Aulnay-sous-Bois");
      expect(o.addressCountry).toBe("FR");
    }
    // home graph has Organization + WebSite and areaServed limited to IDF / Normandie / Manche
    const home = jsonLd((await html(request, "/")).body).flatMap((d) => (d["@graph"] as Record<string, unknown>[]) ?? []);
    const org = home.find((n) => JSON.stringify(n["@type"]).includes("Organization"));
    expect(org).toBeTruthy();
    const names: string[] = [];
    walk(org!["areaServed"], (k, v) => { if (k === "name") names.push(String(v)); });
    for (const n of names) expect(["Île-de-France", "Normandie", "Manche"]).toContain(n);
    // no Service node while service copy is placeholder
    const svc = jsonLd((await html(request, "/services/renovation")).body).flatMap((d) => (d["@graph"] as Record<string, unknown>[]) ?? []);
    expect(svc.some((n) => n["@type"] === "Service")).toBe(false);
  });

  test("published post: BlogPosting grounded in post data, canonical, OG article", async ({ request }) => {
    const post = (await q<{ slug: string; title: string }>("select slug, title from Post where status = 'PUBLISHED' and deletedAt is null limit 1"))[0];
    test.skip(!post, "no published post (run the full suite: admin.spec publishes one)");
    const { status, body } = await html(request, `/blog/${post!.slug}`);
    expect(status).toBe(200);
    expect(body).toContain(`<link rel="canonical" href="${SITE}/blog/${post!.slug}"`);
    expect(meta(body, "property", "og:type")).toBe("article");
    const art = jsonLd(body).flatMap((d) => (d["@graph"] as Record<string, unknown>[]) ?? []).find((n) => n["@type"] === "BlogPosting");
    expect(art?.["headline"]).toBe(post!.title);
    expect(art?.["inLanguage"]).toBe("fr-FR");
    expect(JSON.stringify(art)).not.toMatch(/aggregateRating|review/);
  });
});

test.describe("sitemap and robots", () => {
  test("sitemap lists only published, indexable, 200 URLs on the canonical origin", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("xml");
    const locs = [...(await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]!);
    expect(locs.length).toBeGreaterThan(5);
    const drafts = (await q<{ slug: string }>("select slug from Post where status != 'PUBLISHED' or deletedAt is not null")).map((r) => r.slug);
    const hiddenPages = (await q<{ path: string }>("select path from Page where status != 'PUBLISHED' or deletedAt is not null or noindex = 1 or isPlaceholder = 1")).map((r) => r.path);
    for (const loc of locs) {
      expect(loc.startsWith(`${SITE}`), loc).toBe(true);
      expect(loc).not.toMatch(/\/admin|\/media\/|\/devis\/merci|\?/);
      for (const d of drafts) expect(loc, `draft ${d}`).not.toContain(`/blog/${d}`);
      for (const h of hiddenPages) if (h) expect(loc, `noindex/placeholder ${h}`).not.toBe(`${SITE}/${h}`);
      const r = await request.get(toLocal(loc) || "/", { maxRedirects: 0 });
      expect(r.status(), loc).toBe(200);
    }
  });

  test("robots.txt: allows site, blocks admin, advertises the sitemap", async ({ request }) => {
    const txt = await (await request.get("/robots.txt")).text();
    expect(txt).toContain("User-Agent: *");
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Disallow: /admin");
    expect(txt).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    expect(txt).not.toMatch(/Disallow: \/\s*$/m);
  });

  test("admin responses are noindex + no-store", async ({ request }) => {
    const res = await request.get("/admin/login");
    expect(res.headers()["x-robots-tag"]).toContain("noindex");
  });
});

test.describe("redirects, 410 and 404 (owner UI)", () => {
  test("301, 410, loop and unsafe destinations", async ({ browser }) => {
    const ctx = await newClientContext(browser);
    const page = await ctx.newPage();
    await login(page, "owner");
    const anon = await newClientContext(browser);
    await page.goto("/admin/redirections");
    const create = async (from: string, to: string | null, type = "301") => {
      await page.getByRole("textbox", { name: "Ancienne adresse" }).fill(from);
      await page.getByRole("combobox", { name: /^Type/ }).selectOption(type);
      if (to !== null) await page.getByRole("textbox", { name: "Nouvelle adresse" }).fill(to);
      await page.getByRole("button", { name: "Créer la redirection" }).click();
    };
    await create("/ancien-chemin-e2e", "/contact");
    await expect(page.getByText("Redirection enregistrée.")).toBeVisible();
    await expect.poll(async () => (await anon.request.get("/ancien-chemin-e2e", { maxRedirects: 0 })).status(), { timeout: 15_000 }).toBe(301);
    expect((await anon.request.get("/ancien-chemin-e2e", { maxRedirects: 0 })).headers()["location"]).toMatch(/\/contact$/);

    await create("/page-supprimee-e2e", null, "410");
    await expect(page.getByText("Redirection enregistrée.").first()).toBeVisible();
    await expect.poll(async () => (await anon.request.get("/page-supprimee-e2e", { maxRedirects: 0 })).status(), { timeout: 15_000 }).toBe(410);
    const gone = await anon.request.get("/page-supprimee-e2e", { maxRedirects: 0 });
    expect(await gone.text()).toContain('<html lang="fr"');
    expect(gone.headers()["x-robots-tag"]).toContain("noindex");

    // loop and unsafe targets are refused
    await create("/contact-e2e-b", "/ancien-chemin-e2e");
    await create("/ancien-chemin-e2e", "/contact-e2e-b");
    await expect(page.getByText(/boucle|déjà/i).first()).toBeVisible();
    await create("/xss-e2e", "javascript:alert(1)");
    await expect(page.getByText(/Destination/).first()).toBeVisible();
    await create("/open-e2e", "//evil.example");
    await expect(page.getByText(/Destination invalide|Destination/).first()).toBeVisible();
    expect((await anon.request.get("/xss-e2e", { maxRedirects: 0 })).status()).toBe(404);
    expect((await anon.request.get("/open-e2e", { maxRedirects: 0 })).status()).toBe(404);
    await ctx.close();
    await anon.close();
  });

  test("unknown URLs: HTTP 404 + noindex for page, post, project, category", async ({ request }) => {
    for (const p of ["/nope", "/blog/nope", "/realisations/nope", "/blog/categorie/nope", "/blog/etiquette/nope", "/zones-intervention/nope"]) {
      const r = await request.get(p, { maxRedirects: 0 });
      expect(r.status(), p).toBe(404);
      expect(robotsMetas(await r.text()) + (r.headers()["x-robots-tag"] ?? ""), p).toContain("noindex");
    }
  });
});

test.describe("internal link crawl and content integrity", () => {
  test("every same-origin link/image from / and the sitemap resolves with 200; scan visible copy for forbidden claims", async ({ request }) => {
    const sm = await (await request.get("/sitemap.xml")).text();
    const queue = ["/", ...[...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => toLocal(m[1]!) || "/")];
    const seen = new Set<string>();
    const broken: string[] = [];
    const texts: Record<string, string> = {};
    const assets = new Set<string>();
    while (queue.length && seen.size < 150) {
      const p = queue.shift()!;
      if (seen.has(p)) continue;
      seen.add(p);
      const r = await request.get(p, { maxRedirects: 0 });
      if (r.status() !== 200) {
        broken.push(`${r.status()} ${p}`);
        continue;
      }
      if (!(r.headers()["content-type"] ?? "").includes("text/html")) continue;
      const body = await r.text();
      texts[p] = visibleText(body) + " " + (meta(body, "name", "description") ?? "");
      for (const m of body.matchAll(/<a [^>]*href="([^"]+)"/g)) {
        let h = m[1]!.replace(/&amp;/g, "&");
        if (h.startsWith(SITE)) h = toLocal(h) || "/";
        if (!h.startsWith("/") || h.startsWith("//") || h.startsWith("/_next") || h.startsWith("/admin")) continue;
        h = h.split("#")[0]!;
        if (h && !seen.has(h)) queue.push(h);
      }
      for (const m of body.matchAll(/<img [^>]*src="([^"]+)"/g)) assets.add(m[1]!.replace(/&amp;/g, "&"));
    }
    for (const a of assets) {
      if (!a.startsWith("/")) continue;
      const r = await request.get(a, { maxRedirects: 0 });
      if (r.status() !== 200) broken.push(`${r.status()} asset ${a}`);
    }
    expect(broken, `broken internal links/assets:\n${broken.join("\n")}`).toEqual([]);
    expect(seen.size).toBeGreaterThan(15);

    // ---- forbidden-claims scan on all published public copy (the quote form's budget labels are excluded)
    const rules: [string, RegExp][] = [
      ["phone number", /(?:\+33|\b0)[1-9](?:[\s.-]?\d{2}){4}\b/],
      ["SIREN/SIRET", /\b\d{3}[\s.]?\d{3}[\s.]?\d{3}(?:[\s.]?\d{5})?\b/],
      ["TVA number", /\bFR\s?\d{2}\s?\d{9}\b/],
      ["RCS with value", /RCS\s+[A-ZÉ][\p{L}-]+\s*(?:[AB]\s*)?\d/u],
      ["décennale", /d[ée]cennale/i],
      ["years of experience", /\b\d+\s+ans?\s+d[’']?\s*exp[ée]rience|depuis\s+(?:19|20)\d{2}|fond[ée]e?\s+en\s+\d{4}|plus de \d+\s+(?:ans|projets|chantiers|clients)/i],
      ["rating / review", /\b[1-5][.,]\d\s*\/\s*5\b|[ée]toiles?\b|avis (?:clients?|google)|t[ée]moignages?|clients? satisfaits?|note moyenne/i],
      ["certification claim", /certifi[ée]s?\s+(?:RGE|Qualibat|ISO)|label\s+RGE|qualibat|\bRGE\b|garantie (?:de parfait|biennale)/i],
      ["price in copy", /\b\d[\d\s]*(?:€|euros?)\b/i],
    ];
    const hits: string[] = [];
    for (const [p, t] of Object.entries(texts)) {
      if (p === "/devis") continue;
      for (const [name, re] of rules) {
        const m = t.match(re);
        if (m) hits.push(`${name} @ ${p}: …${t.slice(Math.max(0, (m.index ?? 0) - 60), (m.index ?? 0) + 90)}…`);
      }
    }
    expect(hits, `forbidden-claim candidates:\n${hits.join("\n")}`).toEqual([]);
  });

  test("seeded articles contain no prices, durations or invented facts", async () => {
    const posts = (await q<{ slug: string; title: string; status: string; body: unknown; excerpt: string | null }>("select slug, title, status, body, excerpt from Post")).map((p) => ({ ...p, body: typeof p.body === "string" ? p.body : JSON.stringify(p.body) }));
    expect(posts.length).toBeGreaterThanOrEqual(3);
    const bad: string[] = [];
    for (const p of posts) {
      if (p.slug.startsWith("article-e2e")) continue; // created by the lifecycle test
      const text = `${p.title} ${p.excerpt ?? ""} ${p.body}`;
      if (/\d[\d\s]*(?:€|euros?)/i.test(text)) bad.push(`price in ${p.slug}`);
      if (/\b\d+\s*(?:semaines?|mois|jours|ans)\b/i.test(text)) bad.push(`duration in ${p.slug}`);
      if (/d[ée]cennale|\bRGE\b|qualibat|t[ée]moignage|[ée]toiles?\b/i.test(text)) bad.push(`claim in ${p.slug}`);
    }
    expect(bad).toEqual([]);
  });

  test("service pages link to zone pages and zone pages link to services", async ({ request }) => {
    for (const s of ["renovation", "extension", "construction"]) {
      const b = (await html(request, `/services/${s}`)).body;
      for (const z of ["ile-de-france", "normandie", "manche"]) expect(b, `/services/${s} -> ${z}`).toContain(`href="/zones-intervention/${z}"`);
    }
    for (const z of ["ile-de-france", "normandie", "manche"]) {
      const b = (await html(request, `/zones-intervention/${z}`)).body;
      for (const s of ["renovation", "extension", "construction"]) expect(b, `/zones-intervention/${z} -> ${s}`).toContain(`href="/services/${s}"`);
    }
  });

  test("placeholder content is visibly flagged and legal pages show owner placeholders", async ({ request }) => {
    const svc = visibleText((await html(request, "/services/renovation")).body);
    expect(svc).toMatch(/Contenu de démonstration/);
    const legal = visibleText((await html(request, "/mentions-legales")).body);
    expect(legal).toContain("[À compléter par le propriétaire]");
    expect(legal).toContain("4 rue des Lilas");
    expect(legal).toContain("93600 Aulnay-sous-Bois");
    const priv = visibleText((await html(request, "/politique-de-confidentialite")).body);
    expect(priv).toContain("[À compléter par le propriétaire]");
    for (const p of ["/mentions-legales", "/politique-de-confidentialite"]) expect(robotsMetas((await html(request, p)).body), p).toContain("noindex");
  });
});

test.describe("privacy and performance defaults", () => {
  test("no third-party request, no cookie, no storage, no consent banner by default", async ({ page, context }) => {
    const external: string[] = [];
    page.on("request", (r) => {
      const u = new URL(r.url());
      if (u.hostname !== "localhost") external.push(r.url());
    });
    await page.goto("/");
    await page.goto("/devis");
    await page.waitForLoadState("networkidle");
    expect(external, "third-party requests").toEqual([]);
    expect((await context.cookies()).map((c) => c.name)).toEqual([]);
    expect(await page.evaluate(() => localStorage.length + sessionStorage.length)).toBe(0);
    await expect(page.getByRole("dialog", { name: /cookies|consentement/i })).toHaveCount(0);
    const csp = (await page.request.get("/")).headers()["content-security-policy"] ?? "";
    expect(csp).toContain("upgrade-insecure-requests");
    expect(csp).not.toMatch(/plausible|googletagmanager|google-analytics/);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("security headers on public and admin responses", async ({ request }) => {
    for (const p of ["/", "/admin/login"]) {
      const h = (await request.get(p)).headers();
      expect(h["x-content-type-options"], p).toBe("nosniff");
      expect(h["x-frame-options"], p).toBe("DENY");
      expect(h["referrer-policy"], p).toBe("strict-origin-when-cross-origin");
      expect(h["strict-transport-security"], p).toContain("max-age=");
      expect(h["permissions-policy"], p).toContain("camera=()");
      expect(h["cross-origin-opener-policy"], p).toBe("same-origin");
      expect(h["x-powered-by"], p).toBeUndefined();
    }
    expect((await request.get("/admin/login")).headers()["cache-control"]).toContain("no-store");
  });

  test("home: LCP image prioritised, responsive sizes, self-hosted fonts with swap, no editor code in the HTML", async ({ request }) => {
    const b = (await html(request, "/")).body;
    expect(b, "priority/fetchpriority on the hero image").toMatch(/fetchPriority="high"|fetchpriority="high"|rel="preload"[^>]*as="image"/i);
    expect(b, "responsive sizes on <source>/<img>").toMatch(/<(?:img|source)[^>]*sizes="[^"]+"/);
    const sheets = [...b.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]!);
    const css = (await Promise.all(sheets.map(async (u) => (await request.get(u)).text()))).join("\n");
    expect(css, "self-hosted @font-face with font-display: swap").toMatch(/@font-face\{[^}]*font-display:swap/);
    expect(css).not.toMatch(/fonts\.googleapis|fonts\.gstatic/);
    expect(b).not.toMatch(/tiptap|prosemirror|dnd-kit/i);
    const imgs = [...b.matchAll(/<img[^>]*>/g)].map((m) => m[0]);
    expect(imgs.length).toBeGreaterThan(0);
    for (const i of imgs) {
      expect(i, i).toMatch(/\balt="/);
      expect(i, i).toMatch(/\bwidth="\d+"|\bwidth=|style="[^"]*aspect-ratio|fill/i);
    }
    expect(imgs.some((i) => /loading="lazy"/.test(i)), "below-the-fold images lazy").toBe(true);
  });
});
