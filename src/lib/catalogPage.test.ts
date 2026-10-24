import { describe, expect, it } from "vitest";
import { catalogOrderBy, catalogWhere, CATALOG_MAX_PAGE_SIZE, CATALOG_PAGE_SIZE, genreWhere, matchesTitleQuery, parseCatalogParams } from "./catalogPage";

const parse = (qs: string) => parseCatalogParams(new URLSearchParams(qs));

describe("parseCatalogParams", () => {
  it("sem nada na URL, pede a primeira página por popularidade", () => {
    expect(parse("")).toEqual({ q: "", genre: "", status: "", season: "", year: null, kind: "", availability: "", sort: "popular", offset: 0, limit: CATALOG_PAGE_SIZE });
  });

  it("lê os filtros e normaliza a temporada", () => {
    expect(parse("q=%20naruto%20&genre=Comedy&status=FINISHED&season=fall&year=2010&kind=OVA&availability=scheduled&sort=title&cursor=96&limit=20")).toMatchObject({
      q: "naruto",
      genre: "Comedy",
      status: "FINISHED",
      season: "FALL",
      year: 2010,
      kind: "OVA",
      availability: "scheduled",
      sort: "title",
      offset: 96,
      limit: 20,
    });
  });

  it("ignora o que não faz sentido em vez de quebrar", () => {
    expect(parse("season=inverno&year=abc&availability=x&sort=drop&cursor=-5&limit=99999")).toMatchObject({ season: "", year: null, availability: "", sort: "popular", offset: 0, limit: CATALOG_MAX_PAGE_SIZE });
    expect(parse("year=1800").year).toBeNull();
    expect(parse("cursor=1.5").offset).toBe(0);
  });

  it("corta textos longos demais", () => {
    expect(parse(`q=${"a".repeat(500)}`).q).toHaveLength(100);
  });
});

describe("genreWhere", () => {
  it("casa o gênero inteiro no texto separado por vírgula", () => {
    expect(genreWhere("Shounen")).toEqual({
      OR: [{ genres: "Shounen" }, { genres: { startsWith: "Shounen," } }, { genres: { endsWith: ",Shounen" } }, { genres: { contains: ",Shounen," } }],
    });
  });
});

describe("catalogWhere", () => {
  const base = parse("");
  it("sempre só obras da plataforma, com o conteúdo adulto como categoria (sem filtro de gênero bloqueado)", () => {
    const where = catalogWhere(base, null);
    expect(where.onPlatform).toBe(true);
    expect(JSON.stringify(where.AND ?? [])).not.toContain("hentai");
  });

  it("junta cada filtro", () => {
    const where = catalogWhere(parse("genre=Drama&status=RELEASING&season=SPRING&kind=MOVIE&year=2024&availability=unscheduled"), ["a", "b"]);
    expect(where).toMatchObject({ onPlatform: true, status: "RELEASING", season: "SPRING", kind: "MOVIE" });
    const and = JSON.stringify(where.AND);
    expect(and).toContain('"id":{"in":["a","b"]}');
    expect(and).toContain('"nextEpisodeAt":null');
    expect(and).toContain("2024-01-01T00:00:00.000Z");
    expect(and).toContain("2025-01-01T00:00:00.000Z");
    expect(and).toContain('"genres":"Drama"');
  });

  it("'só com horário' exige data do próximo episódio", () => {
    expect(JSON.stringify(catalogWhere(parse("availability=scheduled"), null).AND)).toContain('"nextEpisodeAt":{"not":null}');
  });
});

describe("catalogOrderBy", () => {
  it("toda ordenação termina em título e id (páginas estáveis)", () => {
    for (const sort of ["popular", "recent", "title", "year", "episodes"] as const) {
      const order = catalogOrderBy(sort);
      expect(order.slice(-2)).toEqual([{ titleRomaji: "asc" }, { id: "asc" }]);
    }
  });

  it("popular põe quem não tem posição por último", () => {
    expect(catalogOrderBy("popular")[0]).toEqual({ popularityRank: { sort: "asc", nulls: "last" } });
    expect(catalogOrderBy("year")[0]).toEqual({ startDate: { sort: "desc", nulls: "last" } });
    expect(catalogOrderBy("episodes")[0]).toEqual({ episodes: { sort: "desc", nulls: "last" } });
  });
});

describe("matchesTitleQuery", () => {
  it("acha um trecho de qualquer um dos títulos, sem diferenciar maiúsculas", () => {
    expect(matchesTitleQuery(["Shingeki no Kyojin", "Attack on Titan", "進撃の巨人"], "attack")).toBe(true);
    expect(matchesTitleQuery(["Shingeki no Kyojin", null, "進撃の巨人"], "進撃")).toBe(true);
    expect(matchesTitleQuery(["Naruto"], "bleach")).toBe(false);
  });

  it("acha outra grafia do mesmo nome", () => {
    expect(matchesTitleQuery(["Bishoujyo Muzai Pirates"], "Bishoujo Muzai")).toBe(true);
    expect(matchesTitleQuery(["Aoashi"], "Ao Ashi")).toBe(true);
  });

  it("busca curta demais não filtra nada", () => {
    expect(matchesTitleQuery(["Qualquer"], "a")).toBe(true);
  });
});
