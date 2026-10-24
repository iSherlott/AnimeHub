import { describe, it, expect } from "vitest";
import { ADULT_MARKER, GENRE_TAXONOMY, genresFromAniList, normalizeGenre, normalizeGenres, visibleGenres } from "@/lib/genreTaxonomy";

describe("vocabulário", () => {
  it("tem exatamente os 18 gêneros definidos para a plataforma", () => {
    expect([...GENRE_TAXONOMY].sort()).toEqual(
      ["Adventure", "Comedy", "Drama", "Ecchi", "Isekai", "Josei", "Loli", "Mecha", "Parody", "Romance", "Sci-fi", "Shoujo", "Shoujo-ai", "Shounen", "Shounen-ai", "Slice of Life", "Yaoi", "Yuri"].sort()
    );
  });

  it("não tem mais Supernatural, Seinen nem o marcador adulto como gênero visível", () => {
    expect(GENRE_TAXONOMY).not.toContain("Supernatural");
    expect(GENRE_TAXONOMY).not.toContain("Seinen");
    expect((GENRE_TAXONOMY as readonly string[]).includes(ADULT_MARKER)).toBe(false);
  });
});

describe("normalizeGenre", () => {
  it("maps exact canonical names to themselves", () => {
    for (const genre of GENRE_TAXONOMY) {
      expect(normalizeGenre(genre)).toBe(genre);
    }
  });

  it("maps known synonyms from each source to the same category", () => {
    expect(normalizeGenre("Sci-Fi")).toBe("Sci-fi");
    expect(normalizeGenre("Science Fiction")).toBe("Sci-fi");
    expect(normalizeGenre("Slice Of Life")).toBe("Slice of Life");
    expect(normalizeGenre("Shonen")).toBe("Shounen");
    expect(normalizeGenre("Shojo")).toBe("Shoujo");
    expect(normalizeGenre("Boys Love")).toBe("Shounen-ai");
    expect(normalizeGenre("Boys' Love")).toBe("Shounen-ai");
    expect(normalizeGenre("Girls Love")).toBe("Shoujo-ai");
    expect(normalizeGenre("Girls' Love")).toBe("Shoujo-ai");
    expect(normalizeGenre("Super Robot")).toBe("Mecha");
  });

  it("is case- and whitespace-insensitive", () => {
    expect(normalizeGenre("  comedy  ")).toBe("Comedy");
    expect(normalizeGenre("SCI-FI")).toBe("Sci-fi");
  });

  it("agora entram Drama, Josei e Loli; Action, Fantasy e Supernatural continuam de fora", () => {
    expect(normalizeGenre("Drama")).toBe("Drama");
    expect(normalizeGenre("Josei")).toBe("Josei");
    expect(normalizeGenre("Loli")).toBe("Loli");
    expect(normalizeGenre("Action")).toBeNull();
    expect(normalizeGenre("Fantasy")).toBeNull();
    expect(normalizeGenre("Supernatural")).toBeNull();
    expect(normalizeGenre("Seinen")).toBeNull();
    expect(normalizeGenre("Some Made Up Niche Tag")).toBeNull();
  });

  it("não deduz Loli de etiquetas adultas", () => {
    expect(normalizeGenre("Lolicon")).toBeNull();
    expect(normalizeGenre("Shotacon")).toBeNull();
  });

  it("keeps Yuri and Shoujo-ai as distinct categories", () => {
    expect(normalizeGenre("Yuri")).toBe("Yuri");
    expect(normalizeGenre("Girls Love")).toBe("Shoujo-ai");
  });

  it("o marcador adulto sobrevive à normalização (a política de conteúdo precisa vê-lo)", () => {
    expect(normalizeGenre("Hentai")).toBe(ADULT_MARKER);
    expect(normalizeGenres(["Comedy", "Hentai"])).toContain(ADULT_MARKER);
  });
});

describe("normalizeGenres", () => {
  it("drops unmapped terms and deduplicates, preserving first-seen order", () => {
    expect(normalizeGenres(["Action", "Sci-Fi", "Drama", "Science Fiction", "Comedy"])).toEqual(["Sci-fi", "Drama", "Comedy"]);
  });

  it("returns an empty array when nothing maps", () => {
    expect(normalizeGenres(["Action", "Fantasy", "Horror"])).toEqual([]);
  });
});

describe("genresFromAniList", () => {
  it("junta os gêneros da obra com as etiquetas relevantes (demografia e tema)", () => {
    const result = genresFromAniList(
      ["Action", "Drama", "Sci-Fi"],
      [
        { name: "Shounen", rank: 90 },
        { name: "Isekai", rank: 60 },
        { name: "Parody", rank: 30 }, // pouco relevante
        { name: "Boys' Love", rank: 80 },
      ]
    );
    expect(result).toEqual(["Drama", "Sci-fi", "Shounen", "Isekai", "Shounen-ai"]);
  });

  it("etiqueta adulta nunca vira gênero", () => {
    expect(genresFromAniList(["Comedy"], [{ name: "Loli", rank: 90, isAdult: true }, { name: "Yaoi", rank: 90, isAdult: true }])).toEqual(["Comedy"]);
  });

  it("mantém o marcador adulto quando o gênero da obra é Hentai", () => {
    expect(genresFromAniList(["Hentai", "Comedy"])).toEqual(["Hentai", "Comedy"]);
  });

  it("visibleGenres mostra o Hentai como categoria (conteúdo adulto não é mais bloqueado)", () => {
    expect(visibleGenres(["Comedy", "Hentai"])).toEqual(["Comedy", "Hentai"]);
  });
});
