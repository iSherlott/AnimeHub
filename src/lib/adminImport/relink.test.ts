import { describe, expect, it } from "vitest";
import type { ScoredCandidate } from "./matching";
import { anidbDisplayTitle, eraGap, fallbackQueries, pickSure, withoutYearTag } from "./relink";

describe("withoutYearTag", () => {
  it("tira a marca de ano que o AniDB põe para desambiguar", () => {
    expect(withoutYearTag("High Card (2024)")).toBe("High Card");
    expect(withoutYearTag("Urusei Yatsura (2022) ")).toBe("Urusei Yatsura");
  });

  it("não mexe no que não é uma marca de ano no fim", () => {
    expect(withoutYearTag("Kingdom 5th Season")).toBe("Kingdom 5th Season");
    expect(withoutYearTag("Show (2024) Special")).toBe("Show (2024) Special");
    expect(withoutYearTag("Show (123)")).toBe("Show (123)");
  });
});

describe("eraGap", () => {
  it("mede a distância em temporadas, atravessando o ano", () => {
    expect(eraGap({ season: "WINTER", seasonYear: 2024 }, { season: "WINTER", seasonYear: 2024 })).toBe(0);
    expect(eraGap({ season: "FALL", seasonYear: 2023 }, { season: "WINTER", seasonYear: 2024 })).toBe(1);
    expect(eraGap({ season: "WINTER", seasonYear: 2024 }, { season: "SPRING", seasonYear: 2023 })).toBe(3); // HIGH CARD 2023 × 2024
  });

  it("sem ano conhecido não há distância", () => {
    expect(eraGap({ season: "WINTER", seasonYear: 2024 }, { season: null, seasonYear: null })).toBeNull();
  });
});

const scored = (title: number, score: number, season: string | null, seasonYear: number | null): ScoredCandidate => ({
  candidate: { id: "ce:1", anilistId: 1, titles: ["X"], season, seasonYear, anidbId: null },
  score,
  detail: { title, season: null, year: null, image: null },
});

describe("pickSure", () => {
  const entry = { titleRomaji: "Hello World", season: "FALL", seasonYear: 2019 };

  it("título idêntico e único, com a temporada diferindo pouco (AniDB × AniList), liga", () => {
    expect(pickSure(entry, [scored(1, 0.85, "SUMMER", 2019)]).reason).toBeNull();
    expect(pickSure(entry, [scored(1, 0.85, "WINTER", 2020)]).reason).toBeNull();
  });

  it("título idêntico mas de época muito distante não liga", () => {
    expect(pickSure(entry, [scored(1, 0.78, "SPRING", 2022)]).reason).toMatch(/época distante/);
  });

  it("título só parecido (85% de score por outro motivo) não liga", () => {
    expect(pickSure(entry, [scored(0.8, 0.8, "FALL", 2019)]).reason).toMatch(/semelhança/);
  });

  it("dois candidatos com o mesmo título é ambíguo", () => {
    expect(pickSure(entry, [scored(1, 0.85, "FALL", 2019), scored(1, 0.8, "FALL", 2020)]).reason).toMatch(/mais de um candidato/);
  });

  it("o ano no título do AniDB tem de ser o da obra", () => {
    const tagged = { titleRomaji: "High Card (2024)", season: "WINTER", seasonYear: 2024 };
    expect(pickSure(tagged, [scored(1, 0.93, "SPRING", 2023)]).reason).toMatch(/pede 2024/);
    expect(pickSure(tagged, [scored(1, 0.99, "WINTER", 2024)]).reason).toBeNull();
  });

  it("sem candidato, não há o que ligar", () => {
    expect(pickSure(entry, []).best).toBeNull();
  });

  it("na busca ao vivo só vale título idêntico", () => {
    expect(pickSure(entry, [scored(0.9, 0.95, "FALL", 2019)], { live: true }).reason).toMatch(/não é idêntico/);
    expect(pickSure(entry, [scored(1, 1, "FALL", 2019)], { live: true }).reason).toBeNull();
  });
});

describe("fallbackQueries", () => {
  it("devolve as palavras mais longas depois da primeira, sem a marca de ano", () => {
    expect(fallbackQueries("Bishoujo Muzai Pirates")).toEqual(["Pirates", "Muzai"]);
    expect(fallbackQueries("High Card (2024)")).toEqual(["Card"].filter((w) => w.length >= 5));
  });

  it("título de uma palavra só não tem busca de reserva", () => {
    expect(fallbackQueries("Hakubo")).toEqual([]);
  });
});

describe("anidbDisplayTitle", () => {
  it("usa o nome do AniDB quando é só outra grafia do mesmo título", () => {
    expect(anidbDisplayTitle("Bishoujo Muzai Pirates", "Bishoujyo Muzai♡Pirates")).toBe("Bishoujo Muzai Pirates");
    expect(anidbDisplayTitle("Ao Ashi", "Aoashi")).toBe("Ao Ashi");
    expect(anidbDisplayTitle("Shanhe Sheji Tu (2023)", "Shan He She Ji Tu")).toBe("Shanhe Sheji Tu"); // só o espaçamento muda; a marca de ano sai
  });

  it("não troca quando a diferença é só de maiúsculas ou pontuação", () => {
    expect(anidbDisplayTitle("Hello World", "HELLO WORLD")).toBeNull();
    expect(anidbDisplayTitle("Rock`n Oyone", "Rock'n Oyone")).toBeNull();
  });

  it("não troca quando é um título de fato diferente (2nd Season × Dai Ni Maku)", () => {
    expect(anidbDisplayTitle("Tsuki ga Michibiku Isekai Douchuu Dai Ni Maku", "Tsuki ga Michibiku Isekai Douchuu 2nd Season")).toBeNull();
  });
});
