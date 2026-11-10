import { describe, expect, it } from "vitest";
import { buildSeasonRecap } from "./seasonRecap";

const row = (key: string, genres: string[], category: "watching" | "unfinished" | "finished" | "dropped" | "other", userScore: number | null = null) => ({
  key,
  href: `/anime/${key}`,
  titleRomaji: `Obra ${key}`,
  titleEnglish: null,
  coverImage: null,
  genres,
  userScore,
  category,
});
const season = { season: "FALL" as const, year: 2026 };

describe("retrospectiva da temporada", () => {
  it("conta obras por andamento e gêneros (um por obra), do mais frequente ao menos", () => {
    const recap = buildSeasonRecap(season, [
      row("1", ["Ação", "Comédia", "Ação"], "watching"),
      row("2", ["Ação", "Drama"], "finished", 9),
      row("3", ["Ação"], "dropped"),
      row("4", ["Comédia"], "other"),
    ]);
    expect(recap.total).toBe(4);
    expect(recap.byCategory).toEqual({ watching: 1, unfinished: 0, finished: 1, dropped: 1 });
    expect(recap.topGenres).toEqual([{ genre: "Ação", count: 3 }, { genre: "Comédia", count: 2 }, { genre: "Drama", count: 1 }]);
    expect(recap.signatureGenre).toBe("Ação");
  });

  it("notas mais altas: só as que têm nota, no máximo três", () => {
    const recap = buildSeasonRecap(season, [row("1", [], "finished", 7), row("2", [], "finished", 10), row("3", [], "finished"), row("4", [], "finished", 8), row("5", [], "finished", 6)]);
    expect(recap.bestRated.map((w) => w.key)).toEqual(["2", "4", "1"]);
  });

  it("sem gênero dominante quando nenhum passa da metade, e lista vazia sem erro", () => {
    expect(buildSeasonRecap(season, [row("1", ["A"], "watching"), row("2", ["B"], "watching"), row("3", ["C"], "watching")]).signatureGenre).toBeNull();
    expect(buildSeasonRecap(season, [])).toMatchObject({ total: 0, topGenres: [], bestRated: [], signatureGenre: null });
  });
});
