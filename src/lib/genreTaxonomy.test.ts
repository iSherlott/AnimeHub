import { describe, it, expect } from "vitest";
import { GENRE_TAXONOMY, normalizeGenre, normalizeGenres } from "@/lib/genreTaxonomy";

describe("normalizeGenre", () => {
  it("maps exact canonical names to themselves", () => {
    for (const genre of GENRE_TAXONOMY) {
      expect(normalizeGenre(genre)).toBe(genre);
    }
  });

  it("maps known synonyms from each source to the same category", () => {
    // Exemplo citado no próprio backlog: AniList "Sci-Fi" e Jikan
    // "Science Fiction" precisam mapear pra "Sci-fi".
    expect(normalizeGenre("Sci-Fi")).toBe("Sci-fi");
    expect(normalizeGenre("Science Fiction")).toBe("Sci-fi");
    expect(normalizeGenre("Slice Of Life")).toBe("Slice of Life");
    expect(normalizeGenre("Shonen")).toBe("Shounen");
    expect(normalizeGenre("Shojo")).toBe("Shoujo");
    expect(normalizeGenre("Boys Love")).toBe("Shounen-ai");
    expect(normalizeGenre("Girls Love")).toBe("Shoujo-ai");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(normalizeGenre("  comedy  ")).toBe("Comedy");
    expect(normalizeGenre("SCI-FI")).toBe("Sci-fi");
  });

  it("discards terms with no mapping instead of inventing a category", () => {
    // "Action" e "Drama" são propositalmente de fora da lista fechada
    // (confirmado com o usuário) — mesmo sendo comuns nas fontes.
    expect(normalizeGenre("Action")).toBeNull();
    expect(normalizeGenre("Drama")).toBeNull();
    expect(normalizeGenre("Fantasy")).toBeNull();
    expect(normalizeGenre("Some Made Up Niche Tag")).toBeNull();
  });

  it("keeps Yuri and Shoujo-ai as distinct categories", () => {
    expect(normalizeGenre("Yuri")).toBe("Yuri");
    expect(normalizeGenre("Girls Love")).toBe("Shoujo-ai");
  });
});

describe("normalizeGenres", () => {
  it("drops unmapped terms and deduplicates, preserving first-seen order", () => {
    const result = normalizeGenres(["Action", "Sci-Fi", "Drama", "Science Fiction", "Comedy"]);
    expect(result).toEqual(["Sci-fi", "Comedy"]);
  });

  it("returns an empty array when nothing maps", () => {
    expect(normalizeGenres(["Action", "Drama", "Fantasy"])).toEqual([]);
  });

  it("merges synonyms from different sources into one category, not two", () => {
    // Simula AniList mandando "Sci-Fi" e Jikan mandando "Science Fiction"
    // pro mesmo anime — não pode virar duas entradas distintas.
    const result = normalizeGenres(["Sci-Fi", "Science Fiction"]);
    expect(result).toEqual(["Sci-fi"]);
  });
});
