import { describe, expect, it } from "vitest";
import { parseDatabaseUrl, toAdapterConfig } from "@/lib/db-url";

describe("parseDatabaseUrl", () => {
  it("parses a Hostinger-style URL with percent-encoded credentials", () => {
    const c = parseDatabaseUrl("mysql://u123_app:p%40ss%3Aw%2Frd%23@127.0.0.1:3306/u123_batinova");
    expect(c).toMatchObject({ host: "127.0.0.1", port: 3306, user: "u123_app", password: "p@ss:w/rd#", database: "u123_batinova", connectionLimit: 5, ssl: false });
  });
  it("defaults the port, clamps connectionLimit and reads ssl", () => {
    expect(parseDatabaseUrl("mysql://u:p@127.0.0.1/db").port).toBe(3306);
    expect(parseDatabaseUrl("mysql://u:p@127.0.0.1/db?connectionLimit=500").connectionLimit).toBe(5);
    expect(parseDatabaseUrl("mysql://u:p@127.0.0.1/db?connectionLimit=8&ssl=true")).toMatchObject({ connectionLimit: 8, ssl: true });
  });
  it("rejects missing, SQLite and malformed URLs without echoing secrets", () => {
    expect(() => parseDatabaseUrl(undefined)).toThrow(/DATABASE_URL/);
    expect(() => parseDatabaseUrl("file:./prisma/dev.db")).toThrow(/mysql/);
    expect(() => parseDatabaseUrl("mysql://u:p@127.0.0.1")).toThrow(/database/);
    try {
      parseDatabaseUrl("mysql://user:sup3rsecret@:::bad");
    } catch (e) {
      expect(String(e)).not.toContain("sup3rsecret");
    }
  });
  it("builds UTC adapter options", () => {
    expect(toAdapterConfig(parseDatabaseUrl("mysql://u:p@127.0.0.1/db"))).toMatchObject({ timezone: "Z", host: "127.0.0.1", database: "db" });
  });
});
