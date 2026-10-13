import { describe, expect, it } from "vitest";
import { continuationReason, suggestContinuations, type SuggestWork } from "./workLinkSuggest";

const work = (anilistId: number, titleRomaji: string, season: string, seasonYear: number, over: Partial<SuggestWork> = {}): SuggestWork => ({
  anilistId,
  titleRomaji,
  titleEnglish: null,
  season,
  seasonYear,
  franchiseId: null,
  ...over,
});

describe("continuationReason", () => {
  it("o nome da nova acrescenta um número", () => {
    const hit = continuationReason(work(1, "Kaguya", "SPRING", 2020), work(2, "Kaguya 3", "SPRING", 2022));
    expect(hit?.reason).toMatch(/número 3/);
  });

  it("o nome da nova complementa o nome da anterior", () => {
    const hit = continuationReason(work(1, "Naruto", "FALL", 2002), work(2, "Naruto Shippuden", "WINTER", 2007));
    expect(hit?.shared).toBe("naruto");
    expect(hit?.reason).toMatch(/complementa/);
  });

  it("mesmo nome, número maior", () => {
    expect(continuationReason(work(1, "Mob Psycho 2", "SPRING", 2020), work(2, "Mob Psycho 3", "SPRING", 2022))?.reason).toMatch(/do 2 para o 3/);
  });

  it("só vale se a nova veio depois", () => {
    expect(continuationReason(work(2, "Kaguya 3", "SPRING", 2022), work(1, "Kaguya", "SPRING", 2020))).toBeNull();
    expect(continuationReason(work(1, "Kaguya", "SPRING", 2020), work(2, "Kaguya 3", "SPRING", 2020))).toBeNull();
  });

  it("não sugere o que o próprio título já liga (2nd Season, Season 2…)", () => {
    expect(continuationReason(work(1, "Jujutsu Kaisen", "FALL", 2020), work(2, "Jujutsu Kaisen 2nd Season", "SUMMER", 2023))).toBeNull();
  });

  it("nomes sem relação não viram sugestão, nem prefixos curtos demais", () => {
    expect(continuationReason(work(1, "Naruto", "FALL", 2002), work(2, "Boruto", "SPRING", 2017))).toBeNull();
    expect(continuationReason(work(1, "One", "FALL", 2002), work(2, "One Piece Film", "SPRING", 2017))).toBeNull();
  });
});

describe("suggestContinuations", () => {
  const naruto = work(1, "Naruto", "FALL", 2002);
  const shippuden = work(2, "Naruto Shippuden", "WINTER", 2007);
  const sasuke = work(3, "Naruto Shippuden Sasuke Arc", "SPRING", 2010);

  it("sugere a anterior mais específica para cada obra", () => {
    const out = suggestContinuations([naruto, shippuden, sasuke], new Set());
    const byLater = new Map(out.map((s) => [s.later.anilistId, s.earlier.anilistId]));
    expect(byLater.get(2)).toBe(1);
    expect(byLater.get(3)).toBe(2); // "naruto shippuden" é um trecho em comum maior que "naruto"
    expect(byLater.has(1)).toBe(false);
  });

  it("não repete o que já foi decidido, em nenhum sentido", () => {
    expect(suggestContinuations([naruto, shippuden], new Set(["1:2"]))).toEqual([]);
    expect(suggestContinuations([naruto, shippuden], new Set(["2:1"]))).toEqual([]);
  });

  it("obras já na mesma franquia não precisam de sugestão", () => {
    expect(suggestContinuations([{ ...naruto, franchiseId: "F" }, { ...shippuden, franchiseId: "F" }], new Set())).toEqual([]);
  });

  it("as mais novas vêm primeiro", () => {
    const out = suggestContinuations([naruto, shippuden, sasuke], new Set());
    expect(out.map((s) => s.later.anilistId)).toEqual([3, 2]);
  });
});
