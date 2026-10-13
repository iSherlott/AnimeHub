import { describe, expect, it } from "vitest";
import { categoryCounts, filterEntries, genreFacets, normalizeSearch, type ProfileAnimeEntry } from "@/lib/profileAnimeList";

const entry = (anilistId: number, titleRomaji: string, genres: string[], extra: Partial<ProfileAnimeEntry> = {}): ProfileAnimeEntry => ({
  anilistId,
  titleRomaji,
  titleEnglish: null,
  titleNative: null,
  titlePortuguese: null,
  coverImage: null,
  genres,
  status: null,
  category: "other",
  seasonsCount: 1,
  ...extra,
});

const list = [
  entry(1, "Kusuriya no Hitorigoto", ["Drama", "Mystery"], { titleEnglish: "The Apothecary Diaries", titleNative: "薬屋のひとりごと" }),
  entry(2, "Sousou no Frieren", ["Adventure", "Drama", "Fantasy"], { titlePortuguese: "Frieren e a Jornada para o Além" }),
  entry(3, "Jujutsu Kaisen", ["Action", "Fantasy"]),
];

describe("normalizeSearch", () => {
  it("ignora acento e caixa", () => {
    expect(normalizeSearch("  Jornada para o ALÉM ")).toBe("jornada para o alem");
  });
});

describe("filterEntries", () => {
  it("sem filtro devolve tudo, na mesma ordem", () => {
    expect(filterEntries(list, "", "").map((e) => e.anilistId)).toEqual([1, 2, 3]);
  });
  it("busca em qualquer um dos títulos, sem acento", () => {
    expect(filterEntries(list, "apothecary", "").map((e) => e.anilistId)).toEqual([1]);
    expect(filterEntries(list, "alem", "").map((e) => e.anilistId)).toEqual([2]);
    expect(filterEntries(list, "薬屋", "").map((e) => e.anilistId)).toEqual([1]);
  });
  it("filtra por gênero exato", () => {
    expect(filterEntries(list, "", "Fantasy").map((e) => e.anilistId)).toEqual([2, 3]);
    expect(filterEntries(list, "", "Fant").map((e) => e.anilistId)).toEqual([]);
  });
  it("busca e gênero se combinam", () => {
    expect(filterEntries(list, "jujutsu", "Fantasy").map((e) => e.anilistId)).toEqual([3]);
    expect(filterEntries(list, "kusuriya", "Fantasy")).toEqual([]);
  });
});

describe("genreFacets", () => {
  it("conta por gênero, do mais frequente ao menos, desempatando em ordem alfabética", () => {
    expect(genreFacets(list)).toEqual([
      { genre: "Drama", count: 2 },
      { genre: "Fantasy", count: 2 },
      { genre: "Action", count: 1 },
      { genre: "Adventure", count: 1 },
      { genre: "Mystery", count: 1 },
    ]);
  });
});

describe("categorias do perfil", () => {
  const withCategory = [
    entry(1, "A", [], { category: "watching" }),
    entry(2, "B", [], { category: "finished" }),
    entry(3, "C", [], { category: "unfinished" }),
    entry(4, "D", [], { category: "other" }),
  ];
  it("filtra por categoria e combina com a busca", () => {
    expect(filterEntries(withCategory, "", "", "finished").map((e) => e.anilistId)).toEqual([2]);
    expect(filterEntries(withCategory, "c", "", "unfinished").map((e) => e.anilistId)).toEqual([3]);
    expect(filterEntries(withCategory, "a", "", "unfinished")).toEqual([]);
  });
  it("conta cada categoria; 'other' só aparece em Todos", () => {
    expect(categoryCounts(withCategory)).toEqual({ watching: 1, unfinished: 1, finished: 1, dropped: 0 });
  });
});