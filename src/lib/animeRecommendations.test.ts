import { describe, expect, it, vi } from "vitest";

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { anime: { findMany } } }));

const { getAggregatedRecommendations } = await import("@/lib/animeRecommendations");

function rec(anilistId: number, titleRomaji = `Anime ${anilistId}`) {
  return { anilistId, titleRomaji, titleEnglish: null, coverImage: null };
}

describe("getAggregatedRecommendations", () => {
  it("achata e deduplica recomendações de vários animes, mantendo a 1ª ocorrência", async () => {
    findMany.mockResolvedValue([
      { anilistId: 1, recommendationsJson: JSON.stringify([rec(10), rec(20)]) },
      { anilistId: 2, recommendationsJson: JSON.stringify([rec(20, "Anime 20 (nome divergente)"), rec(30)]) },
    ]);
    const result = await getAggregatedRecommendations("user-1", 10);
    expect(result.map((r) => r.anilistId)).toEqual([10, 20, 30]);
    // Mantém o título da 1ª ocorrência, não sobrescreve com a 2ª.
    expect(result.find((r) => r.anilistId === 20)?.titleRomaji).toBe("Anime 20");
  });

  it("exclui recomendação de anime que o usuário já tem na própria lista", async () => {
    findMany.mockResolvedValue([
      { anilistId: 1, recommendationsJson: JSON.stringify([rec(1), rec(10)]) },
      { anilistId: 10, recommendationsJson: null },
    ]);
    const result = await getAggregatedRecommendations("user-1", 10);
    expect(result.map((r) => r.anilistId)).toEqual([]);
  });

  it("todo item devolvido é externo (isInternal: false) e linka pra AniList", async () => {
    findMany.mockResolvedValue([{ anilistId: 1, recommendationsJson: JSON.stringify([rec(99)]) }]);
    const result = await getAggregatedRecommendations("user-1", 10);
    expect(result).toEqual([
      { anilistId: 99, titleRomaji: "Anime 99", titleEnglish: null, coverImage: null, href: "https://anilist.co/anime/99", isInternal: false },
    ]);
  });

  it("respeita o limite, e ignora recommendationsJson nulo ou malformado sem quebrar", async () => {
    findMany.mockResolvedValue([
      { anilistId: 1, recommendationsJson: null },
      { anilistId: 2, recommendationsJson: "não é json válido" },
      { anilistId: 3, recommendationsJson: JSON.stringify([rec(10), rec(20), rec(30)]) },
    ]);
    const result = await getAggregatedRecommendations("user-1", 2);
    expect(result.map((r) => r.anilistId)).toEqual([10, 20]);
  });
});
