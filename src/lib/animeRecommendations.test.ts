import { describe, expect, it } from "vitest";
import { rankRecommendations, type FollowedForRecs, type LoadedTitle } from "@/lib/animeRecommendations";

const rec = (anilistId: number) => ({ anilistId, titleRomaji: `Recomendado ${anilistId}`, titleEnglish: null, coverImage: null });
const followed = (anilistId: number, genres: string[], recs: number[] = [], titleRomaji = `Seguido ${anilistId}`): FollowedForRecs => ({
  anilistId,
  titleRomaji,
  genres,
  recommendations: recs.map(rec),
});
const loaded = (anilistId: number, genres: string[], popularityRank: number | null = null): LoadedTitle => ({
  anilistId,
  titleRomaji: `Carregado ${anilistId}`,
  titleEnglish: null,
  coverImage: null,
  genres,
  popularityRank,
});

describe("rankRecommendations", () => {
  it("recomenda só o que foi carregado: recomendação da AniList fora do catálogo carregado é ignorada", () => {
    const result = rankRecommendations([followed(1, [], [10, 20])], [loaded(20, [])], 10);
    expect(result.map((r) => r.anilistId)).toEqual([20]);
  });

  it("usa os dados da obra carregada, aponta para a página interna e diz por quê", () => {
    const [item] = rankRecommendations([followed(1, [], [20], "Meu Anime")], [loaded(20, [])], 10);
    expect(item).toMatchObject({ anilistId: 20, titleRomaji: "Carregado 20", href: "/anime/20", isInternal: true, becauseTitle: "Meu Anime", sharedGenres: [] });
  });

  it("deduplica (mantém a 1ª ocorrência) e nunca recomenda o que a pessoa já acompanha", () => {
    const result = rankRecommendations([followed(1, [], [20, 30]), followed(2, [], [20, 1])], [loaded(20, []), loaded(30, []), loaded(1, [])], 10);
    expect(result.map((r) => r.anilistId)).toEqual([20, 30]);
    expect(result.find((r) => r.anilistId === 20)?.becauseTitle).toBe("Seguido 1");
  });

  it("completa com afinidade de gêneros: mais gêneros em comum primeiro, depois a mais popular", () => {
    const result = rankRecommendations(
      [followed(1, ["Comedy", "Romance"]), followed(2, ["Comedy"])],
      [loaded(10, ["Comedy"], 5), loaded(11, ["Comedy", "Romance"], 50), loaded(12, ["Comedy"], 1), loaded(13, ["Horror"], 1)],
      10
    );
    expect(result.map((r) => r.anilistId)).toEqual([11, 12, 10]);
    expect(result[0].sharedGenres).toEqual(["Comedy", "Romance"]);
    expect(result[0].becauseTitle).toBeNull();
  });

  it("as da AniList vêm antes das de afinidade e não repetem", () => {
    const result = rankRecommendations([followed(1, ["Comedy"], [20])], [loaded(10, ["Comedy"], 1), loaded(20, ["Comedy"], 99)], 10);
    expect(result.map((r) => r.anilistId)).toEqual([20, 10]);
  });

  it("sem nada carregado ou sem gêneros em comum, não recomenda nada", () => {
    expect(rankRecommendations([followed(1, ["Comedy"], [5])], [], 10)).toEqual([]);
    expect(rankRecommendations([followed(1, ["Comedy"])], [loaded(9, ["Horror"])], 10)).toEqual([]);
  });

  it("respeita o limite", () => {
    const result = rankRecommendations([followed(1, ["Comedy"])], [loaded(10, ["Comedy"]), loaded(11, ["Comedy"]), loaded(12, ["Comedy"])], 2);
    expect(result).toHaveLength(2);
  });
});
