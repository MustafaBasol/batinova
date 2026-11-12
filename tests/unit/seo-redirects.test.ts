import { describe, expect, it } from "vitest";
import { resolveFromTable, type RedirectRow } from "@/lib/seo/redirects";

const table = (...rows: RedirectRow[]) => new Map(rows.map((r) => [r.fromPath, r]));

describe("seo-redirects: pure resolution", () => {
  it("returns 301/302/308 with the target", () => {
    const t = table(
      { fromPath: "/old", toPath: "/new", statusCode: 301 },
      { fromPath: "/tmp", toPath: "/new", statusCode: 302 },
      { fromPath: "/perm", toPath: "/new", statusCode: 308 },
    );
    expect(resolveFromTable(t, "/old")).toMatchObject({ status: 301, to: "/new" });
    expect(resolveFromTable(t, "/tmp")).toMatchObject({ status: 302, to: "/new" });
    expect(resolveFromTable(t, "/perm")).toMatchObject({ status: 308, to: "/new" });
    expect(resolveFromTable(t, "/old/")).toMatchObject({ status: 301, to: "/new" }); // trailing slash tolerated
    expect(resolveFromTable(t, "/unknown")).toBeNull();
  });
  it("returns 410 Gone, also at the end of a chain", () => {
    const t = table(
      { fromPath: "/gone", toPath: null, statusCode: 410 },
      { fromPath: "/a", toPath: "/gone", statusCode: 301 },
    );
    expect(resolveFromTable(t, "/gone")).toMatchObject({ status: 410 });
    expect(resolveFromTable(t, "/a")).toMatchObject({ status: 410 });
  });
  it("collapses chains into a single hop", () => {
    const t = table(
      { fromPath: "/a", toPath: "/b", statusCode: 301 },
      { fromPath: "/b", toPath: "/c", statusCode: 301 },
    );
    expect(resolveFromTable(t, "/a")).toMatchObject({ status: 301, to: "/c" });
  });
  it("never loops (self redirect, cycle, over-long chain)", () => {
    expect(resolveFromTable(table({ fromPath: "/a", toPath: "/a", statusCode: 301 }), "/a")).toBeNull();
    expect(
      resolveFromTable(table({ fromPath: "/a", toPath: "/b", statusCode: 301 }, { fromPath: "/b", toPath: "/a", statusCode: 301 }), "/a"),
    ).toBeNull();
    const chain = Array.from({ length: 12 }, (_, i) => ({ fromPath: `/p${i}`, toPath: `/p${i + 1}`, statusCode: 301 }));
    expect(resolveFromTable(table(...chain), "/p0")).toBeNull();
  });
  it("refuses protocol-relative and non-https absolute targets (open redirect)", () => {
    const t = table(
      { fromPath: "/x", toPath: "//evil.example", statusCode: 301 },
      { fromPath: "/y", toPath: "javascript:alert(1)", statusCode: 301 },
      { fromPath: "/z", toPath: "https://www.service-public.fr/", statusCode: 301 },
    );
    expect(resolveFromTable(t, "/x")).toBeNull();
    expect(resolveFromTable(t, "/y")).toBeNull();
    expect(resolveFromTable(t, "/z")).toMatchObject({ status: 301, to: "https://www.service-public.fr/" });
  });
});
