import { describe, expect, it, vi } from "vitest";
import type { AniListMedia } from "@/lib/anilist";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

const { chunk, parseIds, mergeCatalogFields, missingFields, MAX_SELECTION } = await import("@/lib/anilistImport");

const incoming = (extra: Partial<AniListMedia> = {}): AniListMedia => ({
  id: 1,
  idMal: 99,
  title: { romaji: "Obra", english: "Work", native: "作品" },
  coverImage: { extraLarge: "https://img/cover.jpg" },
  bannerImage: "https://img/banner.jpg",
  description: "Sinopse nova.",
  episodes: 12,
  status: "RELEASING",
  season: "FALL",
  seasonYear: 2026,
  genres: ["Comedy", "Romance"],
  averageScore: 80,
  startDate: { year: 2026, month: 10, day: 5 },
  endDate: null,
  nextAiringEpisode: { episode: 3, airingAt: 1_790_000_000 },
  externalLinks: [],
  ...extra,
});

const empty = { titleEnglish: null, titleNative: null, coverImage: null, bannerImage: null, description: null, episodes: null, status: null, season: null, genres: null, averageScore: null, startDate: null, endDate: null, seasonYear: null, malId: null, nextEpisodeNumber: null, nextEpisodeAt: null };

describe("parseIds", () => {
  it("aceita lista de inteiros positivos, sem repetir, até o limite", () => {
    expect(parseIds([3, "4", 3])).toEqual([3, 4]);
    expect(parseIds(Array.from({ length: MAX_SELECTION }, (_, i) => i + 1))).toHaveLength(MAX_SELECTION);
  });
  it("recusa vazio, não-lista, valores inválidos e excesso", () => {
    expect(parseIds([])).toBeNull();
    expect(parseIds("1")).toBeNull();
    expect(parseIds([0])).toBeNull();
    expect(parseIds([1.5])).toBeNull();
    expect(parseIds(["a"])).toBeNull();
    expect(parseIds(Array.from({ length: MAX_SELECTION + 1 }, (_, i) => i + 1))).toBeNull();
  });
});

describe("chunk", () => {
  it("divide em lotes", () => expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]));
});

describe("missingFields", () => {
  it("lista com nomes legíveis o que está vazio", () => {
    expect(missingFields({ ...empty, genres: "Comedy", episodes: 12 })).toEqual(["título em inglês", "título original", "capa", "banner", "sinopse", "situação", "temporada", "data de início"]);
  });
  it("nº de episódios, nota e término só contam quando a obra já terminou (no ar, a AniList ainda não tem)", () => {
    const base = { ...empty, titleEnglish: "a", titleNative: "b", coverImage: "c", bannerImage: "d", description: "e", season: "FALL", genres: "g", startDate: new Date() };
    expect(missingFields({ ...base, status: "RELEASING" })).toEqual([]);
    expect(missingFields({ ...base, status: "NOT_YET_RELEASED" })).toEqual([]);
    expect(missingFields({ ...base, status: "FINISHED" })).toEqual(["nº de episódios", "nota", "data de término"]);
  });
  it("obra completa não falta nada", () => {
    const full = { titleEnglish: "a", titleNative: "b", coverImage: "c", bannerImage: "d", description: "e", episodes: 1, status: "f", season: "FALL", genres: "g", averageScore: 1, startDate: new Date(), endDate: new Date() };
    expect(missingFields(full)).toEqual([]);
  });
});

describe("mergeCatalogFields", () => {
  it("preenche só o que está vazio e não mexe no que já existe", () => {
    const { data, filled } = mergeCatalogFields({ ...empty, titleEnglish: "Meu título", coverImage: "https://local/cover.jpg" }, incoming(), false);
    expect(data).not.toHaveProperty("titleEnglish");
    expect(data).not.toHaveProperty("coverImage");
    expect(data).toMatchObject({ titleNative: "作品", bannerImage: "https://img/banner.jpg", description: "Sinopse nova.", episodes: 12, genres: "Comedy,Romance", seasonYear: 2026, malId: 99 });
    expect(filled).toContain("sinopse");
    expect(filled).not.toContain("capa");
  });

  it("com sobrescrever, a AniList vale em tudo que ela trouxe", () => {
    const { data } = mergeCatalogFields({ ...empty, titleEnglish: "Meu título", coverImage: "https://local/cover.jpg" }, incoming(), true);
    expect(data).toMatchObject({ titleEnglish: "Work", coverImage: "https://img/cover.jpg" });
  });

  it("valor igual não conta como preenchido, e o que a AniList não tem não apaga o que existe", () => {
    const { data, filled } = mergeCatalogFields({ ...empty, description: "Sinopse nova.", episodes: 12 }, incoming({ bannerImage: null }), true);
    expect(filled).not.toContain("sinopse");
    expect(filled).not.toContain("banner");
    expect(data).not.toHaveProperty("bannerImage");
  });

  it("atualiza o próximo episódio sempre que a AniList informa", () => {
    const { data } = mergeCatalogFields({ ...empty, nextEpisodeNumber: 1 }, incoming(), false);
    expect(data.nextEpisodeNumber).toBe(3);
    expect(data.nextEpisodeAt).toEqual(new Date(1_790_000_000 * 1000));
  });
});
