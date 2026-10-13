import { describe, expect, it } from "vitest";
import type { DiscoverItem } from "./discoverItem";
import { genreWeights, rankByAffinity, shuffled, takeUnique, validTimeZone } from "./exploreSections";

const item = (key: string): DiscoverItem => ({
  key,
  anilistId: Number(key.replace(/\D/g, "")) || null,
  kitsuId: null,
  titleRomaji: key,
  titleEnglish: null,
  titleNative: null,
  coverImage: null,
  bannerImage: null,
  description: null,
  episodes: null,
  genres: [],
  status: null,
  season: null,
  startDate: null,
  endDate: null,
  nextEpisodeNumber: null,
  nextEpisodeAt: null,
  popularityRank: null,
  cached: true,
  inMyList: false,
  animeId: null,
});

describe("genreWeights", () => {
  it("conta quantas obras da lista têm cada gênero", () => {
    const w = genreWeights([{ genres: "Comedy,Drama" }, { genres: "Comedy" }, { genres: null }]);
    expect(w.get("Comedy")).toBe(2);
    expect(w.get("Drama")).toBe(1);
    expect(w.has("Action")).toBe(false);
  });
});

describe("rankByAffinity", () => {
  const weights = genreWeights([{ genres: "Comedy,Romance" }, { genres: "Comedy" }]);
  const pool = [
    { anilistId: 1, genres: ["Action"] },
    { anilistId: 2, genres: ["Comedy"] },
    { anilistId: 3, genres: ["Comedy", "Romance"] },
    { anilistId: 4, genres: ["Romance"] },
  ];

  it("deixa de fora quem não tem gênero em comum e põe primeiro quem combina mais", () => {
    const ids = rankByAffinity(pool, weights, () => 0.5).map((c) => c.anilistId);
    expect(ids).not.toContain(1);
    expect(ids[0]).toBe(3); // Comedy (2) + Romance (1)
    expect(ids.slice(1)).toEqual([2, 4]); // Comedy (2) antes de Romance (1)
  });
});

describe("takeUnique", () => {
  it("segue a ordem das listas, não repete a obra e respeita o limite", () => {
    const out = takeUnique([[item("a1"), item("a2")], [item("a2"), item("a3"), item("a4")]], 3);
    expect(out.map((i) => i.key)).toEqual(["a1", "a2", "a3"]);
  });
});

describe("shuffled", () => {
  it("não altera a lista original e mantém os mesmos itens", () => {
    const source = [1, 2, 3, 4, 5];
    const out = shuffled(source, () => 0.3);
    expect(source).toEqual([1, 2, 3, 4, 5]);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("validTimeZone", () => {
  it("aceita fusos reais e recusa o resto", () => {
    expect(validTimeZone("America/Sao_Paulo")).toBe("America/Sao_Paulo");
    expect(validTimeZone("Nao/Existe")).toBeNull();
    expect(validTimeZone(null)).toBeNull();
  });
});
