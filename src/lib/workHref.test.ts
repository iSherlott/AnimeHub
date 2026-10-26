import { describe, expect, it } from "vitest";
import { CATALOG_ONLY_SLUG, workHref } from "@/lib/workHref";

describe("endereço da página da obra", () => {
  it("com AniList ID vai para /anime/<id>; sem ele, pelo AniDB ou pela Kitsu", () => {
    expect(workHref({ anilistId: 21, anidbId: 69 })).toBe("/anime/21");
    expect(workHref({ anilistId: null, anidbId: 69 })).toBe("/anime/anidb-69");
    expect(workHref({ anilistId: null, kitsuId: 7, anidbId: 69 })).toBe("/anime/kitsu-7");
    expect(workHref({ anilistId: null, key: "anidb-69" })).toBe("/anime/anidb-69");
    // Chave sem identificador (anidb-null) não vira endereço.
    expect(workHref({ anilistId: null, key: "anidb-null" })).toBeNull();
  });

  it("só aceita anidb-<n> e kitsu-<n>", () => {
    expect(CATALOG_ONLY_SLUG.test("anidb-123")).toBe(true);
    expect(CATALOG_ONLY_SLUG.test("kitsu-9")).toBe(true);
    expect(CATALOG_ONLY_SLUG.test("mal-9")).toBe(false);
    expect(CATALOG_ONLY_SLUG.test("anidb-12a")).toBe(false);
  });
});
