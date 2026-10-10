import { describe, expect, it } from "vitest";
import { extractHashtags } from "./hashtags";
import { animeHashtagFor, buildNewsPostBody, groupByUrl } from "./newsHub";

describe("animeHashtagFor", () => {
  it("usa o título em inglês, sem símbolos e em minúsculas", () => {
    expect(animeHashtagFor({ titleRomaji: "Kusuriya no Hitorigoto", titleEnglish: "The Apothecary Diaries" })).toBe("#theapothecarydiaries");
  });

  it("cai no romaji quando não há inglês ou ele passa do limite de uma hashtag", () => {
    expect(animeHashtagFor({ titleRomaji: "Ao no Hako", titleEnglish: null })).toBe("#aonohako");
    const long = "A".repeat(60);
    expect(animeHashtagFor({ titleRomaji: "Curto Mesmo", titleEnglish: long })).toBe("#curtomesmo");
  });

  it("trunca no limite quando nenhum título cabe, e devolve null sem letras", () => {
    const tag = animeHashtagFor({ titleRomaji: "B".repeat(70), titleEnglish: null });
    expect(tag).toBe(`#${"b".repeat(40)}`);
    expect(animeHashtagFor({ titleRomaji: "★★★", titleEnglish: null })).toBeNull();
  });

  it("gera hashtags que o extrator reconhece", () => {
    const tag = animeHashtagFor({ titleRomaji: "Re:Zero 3rd Season", titleEnglish: null }) as string;
    expect(extractHashtags(`texto\n\n${tag}`).map((h) => `#${h.key}`)).toEqual([tag]);
  });
});

describe("buildNewsPostBody", () => {
  const base = { title: "Season 3 confirmed", excerpt: "Staff and cast announced.", url: "https://example.com/news/1", source: "Anime News Network", hashtags: ["#kusuriya"] };

  it("monta título, trecho, fonte com link e a linha das #", () => {
    expect(buildNewsPostBody(base)).toBe("Season 3 confirmed\n\nStaff and cast announced.\n\nFonte: Anime News Network — https://example.com/news/1\n\n#kusuriya");
  });

  it("nunca passa de 500 caracteres e preserva a fonte e as #", () => {
    const body = buildNewsPostBody({ ...base, title: "T".repeat(300), excerpt: "palavra ".repeat(200), hashtags: ["#a1", "#b2", "#c3", "#d4", "#e5", "#f6"] });
    expect(body.length).toBeLessThanOrEqual(500);
    expect(body).toContain("Fonte: Anime News Network — https://example.com/news/1");
    expect(body.endsWith("#a1 #b2 #c3 #d4 #e5")).toBe(true); // máximo de 5 hashtags
  });

  it("sem trecho, não deixa linha vazia", () => {
    expect(buildNewsPostBody({ ...base, excerpt: null })).toBe("Season 3 confirmed\n\nFonte: Anime News Network — https://example.com/news/1\n\n#kusuriya");
  });
});

describe("groupByUrl", () => {
  const row = (id: string, anilistId: number, url: string) => ({ id, anilistId, url, title: "t", excerpt: null, imageUrl: null, source: "ANN", publishedAt: new Date(0) });

  it("junta as obras citadas pela mesma matéria em uma só publicação", () => {
    const groups = groupByUrl([row("1", 10, "https://x/a"), row("2", 11, "https://x/a"), row("3", 12, "https://x/b")]);
    expect(groups.map((g) => g.map((r) => r.id))).toEqual([["1", "2"], ["3"]]);
  });
});
