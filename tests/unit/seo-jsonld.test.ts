/* eslint-disable @typescript-eslint/no-explicit-any -- tests inspect loosely typed Next Metadata / JSON-LD objects */
import { describe, expect, it } from "vitest";
import { defaultSettings } from "@/lib/settings-schema";
import {
  buildArticle,
  buildBreadcrumbList,
  buildOrganization,
  buildService,
  buildWebSite,
  graph,
  serializeJsonLd,
} from "@/lib/seo/jsonld";
import { postBreadcrumbs } from "@/components/site/breadcrumbs";

const settings = () => defaultSettings();

describe("seo-jsonld: Organization", () => {
  it("has the supplied address and areaServed, and NO unverified facts", () => {
    const org = buildOrganization(settings()) as any;
    expect(org["@type"]).toEqual(["Organization", "HomeAndConstructionBusiness"]);
    expect(org.url).toBe("https://btnv.fr");
    expect(org.logo.url).toBe("https://btnv.fr/brand/batinova-logo.png");
    expect(org.address).toMatchObject({
      "@type": "PostalAddress",
      streetAddress: "4 rue des Lilas",
      postalCode: "93600",
      addressLocality: "Aulnay-sous-Bois",
      addressCountry: "FR",
    });
    expect(org.areaServed.map((a: any) => a.name)).toEqual(["Île-de-France", "Normandie", "Manche"]);
    expect(org.areaServed[2].containedInPlace.name).toBe("Normandie");
    for (const k of ["telephone", "email", "sameAs", "aggregateRating", "review", "openingHours", "openingHoursSpecification", "foundingDate", "geo", "priceRange", "legalName"]) {
      expect(org).not.toHaveProperty(k);
    }
  });
  it("adds telephone only when marked verified, and sameAs when set", () => {
    const s = settings();
    s.company.phone = { value: "+33 1 00 00 00 00", verified: false };
    expect(buildOrganization(s)).not.toHaveProperty("telephone");
    s.company.phone = { value: "+33 1 00 00 00 00", verified: true };
    s.social.linkedin = "https://www.linkedin.com/company/example";
    const org = buildOrganization(s) as any;
    expect(org.telephone).toBe("+33 1 00 00 00 00");
    expect(org.sameAs).toEqual(["https://www.linkedin.com/company/example"]);
  });
  it("omits the address when the owner hides it", () => {
    const s = settings();
    s.address.showOnSite = false;
    expect(buildOrganization(s)).not.toHaveProperty("address");
  });
});

describe("seo-jsonld: other nodes", () => {
  it("WebSite is French and references the organization", () => {
    const w = buildWebSite() as any;
    expect(w["@type"]).toBe("WebSite");
    expect(w.inLanguage).toBe("fr-FR");
    expect(w.publisher["@id"]).toContain("#organization");
  });
  it("BreadcrumbList positions and absolute URLs", () => {
    const b = buildBreadcrumbList(postBreadcrumbs({ slug: "a", title: "A", category: { slug: "c", name: "C" } })) as any;
    expect(b.itemListElement.map((i: any) => i.position)).toEqual([1, 2, 3, 4]);
    expect(b.itemListElement[3].item).toBe("https://btnv.fr/blog/a");
    expect(b.itemListElement[0].item).toBe("https://btnv.fr");
  });
  it("BlogPosting: dates, image, organization author and publisher logo", () => {
    const a = buildArticle({
      title: "Titre",
      description: "Desc",
      path: "/blog/titre",
      imageUrl: "https://btnv.fr/media/x.webp",
      publishedAt: new Date("2026-02-01T00:00:00Z"),
      modifiedAt: new Date("2026-02-03T00:00:00Z"),
      authorDisplayName: "L’équipe BatiNova",
    }) as any;
    expect(a["@type"]).toBe("BlogPosting");
    expect(a.image).toEqual(["https://btnv.fr/media/x.webp"]);
    expect(a.datePublished).toBe("2026-02-01T00:00:00.000Z");
    expect(a.dateModified).toBe("2026-02-03T00:00:00.000Z");
    expect(a.author["@type"]).toBe("Organization");
    expect(a.publisher.logo.url).toBe("https://btnv.fr/brand/batinova-logo.png");
    expect(a.mainEntityOfPage["@id"]).toBe("https://btnv.fr/blog/titre");
  });
  it("uses a Person author only for an individual's name", () => {
    const a = buildArticle({ title: "T", path: "/blog/t", authorDisplayName: "Camille Martin" }) as any;
    expect(a.author).toEqual({ "@type": "Person", name: "Camille Martin" });
  });
  it("Service is skipped for placeholder content", () => {
    expect(buildService({ name: "Rénovation", path: "/services/renovation", isPlaceholder: true }, settings())).toBeNull();
    const s = buildService({ name: "Rénovation", path: "/services/renovation", isPlaceholder: false }, settings()) as any;
    expect(s["@type"]).toBe("Service");
    expect(s.provider["@id"]).toContain("#organization");
    expect(s.areaServed).toHaveLength(3);
  });
  it("serialisation cannot break out of the script tag", () => {
    const out = serializeJsonLd(graph({ "@type": "Thing", name: "</script><script>alert(1)</script> &  " }));
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(JSON.parse(out)["@graph"][0].name).toContain("</script>");
  });
});
