import { describe, expect, it } from "vitest";
import type { CurationMedia } from "@/lib/anilist";
import { curateEntry, parseStoredGenres, type CurateEntry } from "./curateEntry";

const entry = (over: Partial<CurateEntry> = {}): CurateEntry => ({
  anilistId: 1,
  titleRomaji: "Obra Teste",
  titleEnglish: null,
  titleNative: null,
  description: null,
  genres: null,
  format: null,
  kind: null,
  officialSite: null,
  relationsJson: null,
  descriptionPt: null,
  descriptionJa: null,
  ...over,
});

const media = (over: Partial<CurationMedia> = {}): CurationMedia => ({
  id: 1,
  idMal: null,
  title: { romaji: "Obra Teste", english: "Test Work", native: "テスト" },
  coverImage: { extraLarge: null },
  bannerImage: null,
  description: "A story.",
  episodes: 12,
  status: "FINISHED",
  format: "TV",
  season: "SPRING",
  seasonYear: 2020,
  genres: ["Drama", "Sci-fi", "Shounen"],
  averageScore: null,
  startDate: null,
  endDate: null,
  nextAiringEpisode: null,
  externalLinks: [{ site: "Official Site", url: "https://example.com", type: "INFO" }],
  isAdult: false,
  relations: [{ id: 2, titleRomaji: "Obra Teste 2", format: "TV", relationType: "SEQUEL" }],
  ...over,
});

const codes = (r: ReturnType<typeof curateEntry>) => r.issues.map((i) => i.code).sort();

describe("curateEntry", () => {
  it("completa o que falta com o que a AniList devolve e classifica o tipo", () => {
    const r = curateEntry({ entry: entry(), media: media(), translations: {} });
    expect(r.patch).toMatchObject({
      titleEnglish: "Test Work",
      titleNative: "テスト",
      description: "A story.",
      genres: "Drama,Sci-fi,Shounen",
      format: "TV",
      kind: "EPISODE",
      officialSite: "https://example.com",
    });
    expect(JSON.parse(r.patch.relationsJson as string)).toHaveLength(1);
    expect(r.changed).toEqual(expect.arrayContaining(["titles", "synopsis", "genres", "format", "kind", "officialSite", "relations"]));
    expect(codes(r)).toEqual([]);
  });

  it("nunca sobrescreve o que já existe (título fixado, sinopse do AniDB)", () => {
    const r = curateEntry({
      entry: entry({ titleEnglish: "Nome do AniDB", titleNative: "名前", description: "Sinopse do AniDB.", officialSite: "https://anidb.example" }),
      media: media(),
      translations: {},
    });
    expect(r.patch).toMatchObject({ titleEnglish: "Nome do AniDB", titleNative: "名前", description: "Sinopse do AniDB.", officialSite: "https://anidb.example" });
  });

  it("mantém os gêneros que a obra já tinha (no vocabulário atual) e junta os da fonte; descarta o vocabulário antigo", () => {
    const r = curateEntry({ entry: entry({ genres: "Comedy,Supernatural,Seinen,Yaoi" }), media: media({ genres: ["Drama"] }), translations: {} });
    expect(r.patch.genres).toBe("Comedy,Yaoi,Drama");
  });

  it("junta os gêneros que o AniDB deu à obra (Drama e Josei, que a lista antiga descartava)", () => {
    const r = curateEntry({ entry: entry({ anilistId: null, genres: "Comedy" }), media: null, translations: {}, anidbGenres: ["Drama", "Josei", "Comedy"] });
    expect(r.patch.genres).toBe("Comedy,Drama,Josei");
    expect(codes(r)).not.toContain("NO_GENRE");
    const sem = curateEntry({ entry: entry({ anilistId: null }), media: null, translations: {}, anidbGenres: [] });
    expect(codes(sem)).toContain("NO_GENRE");
  });

  it("obra só do AniDB (sem AniList) é curada com o que tem e fica com as pendências", () => {
    const r = curateEntry({ entry: entry({ anilistId: null, format: "MOVIE", genres: "Comedy" }), media: null, translations: {} });
    expect(r.patch.kind).toBe("MOVIE");
    expect(r.patch.genres).toBe("Comedy");
    expect(codes(r)).toEqual(["OFFICIAL_SITE_MISSING", "SYNOPSIS_EN_MISSING", "TITLE_EN_MISSING", "TITLE_JA_MISSING"]);
  });

  it("id da AniList que não volta vira pendência e nada é inventado", () => {
    const r = curateEntry({ entry: entry({ format: "OVA", description: "x", titleEnglish: "x", titleNative: "x", officialSite: "https://x" }), media: null, translations: {} });
    expect(codes(r)).toEqual(["ANILIST_NOT_FOUND", "NO_GENRE"]);
    expect(r.patch.kind).toBe("OVA");
  });

  it("sem formato em lugar nenhum, o tipo fica desconhecido", () => {
    const r = curateEntry({ entry: entry({ anilistId: null }), media: null, translations: {} });
    expect(r.patch.kind).toBeNull();
    expect(codes(r)).toContain("KIND_UNKNOWN");
  });

  it("obra adulta sai da plataforma e o marcador nunca vira gênero", () => {
    const r = curateEntry({ entry: entry(), media: media({ genres: ["Hentai", "Comedy"] }), translations: {} });
    expect(r.adult).toBe(true);
    expect(r.patch.genres).toBe("Comedy");
    expect(codes(r)).toContain("ADULT_REMOVED");
    expect(curateEntry({ entry: entry(), media: media({ isAdult: true }), translations: {} }).adult).toBe(true);
  });

  it("traz as sinopses traduzidas já guardadas, sem apagar as existentes", () => {
    const r = curateEntry({ entry: entry({ descriptionJa: "既存" }), media: media(), translations: { pt: "Uma história.", ja: "ある物語" } });
    expect(r.patch.descriptionPt).toBe("Uma história.");
    expect(r.patch.descriptionJa).toBe("ある物語");
    expect(r.changed).toContain("translations");
    expect(curateEntry({ entry: entry({ descriptionJa: "既存" }), media: media(), translations: {} }).patch.descriptionJa).toBe("既存");
  });

  it("especiais viram OVA, ODA e filme", () => {
    expect(curateEntry({ entry: entry(), media: media({ format: "OVA" }), translations: {} }).patch.kind).toBe("OVA");
    expect(curateEntry({ entry: entry(), media: media({ format: "SPECIAL" }), translations: {} }).patch.kind).toBe("ODA");
    expect(curateEntry({ entry: entry(), media: media({ format: "MOVIE" }), translations: {} }).patch.kind).toBe("MOVIE");
  });

  it("rodar de novo sobre o resultado não muda mais nada", () => {
    const first = curateEntry({ entry: entry(), media: media(), translations: {} });
    const again = curateEntry({ entry: { ...entry(), ...first.patch }, media: media(), translations: {} });
    expect(again.changed).toEqual([]);
  });
});

describe("parseStoredGenres", () => {
  it("lê o texto guardado e fica só com o vocabulário atual", () => {
    expect(parseStoredGenres("Comedy, Supernatural,Josei")).toEqual(["Comedy", "Josei"]);
    expect(parseStoredGenres(null)).toEqual([]);
  });
});
