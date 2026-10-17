import { describe, expect, it } from "vitest";
import { classifyMatch, dice, looseKey, normalizeTitle, rankCandidates, scoreCandidate, type MatchCandidate, type MatchInput } from "./matching";

const cand = (id: string, titles: string[], over: Partial<MatchCandidate> = {}): MatchCandidate => ({
  id,
  anilistId: Number(id.replace(/\D/g, "")) || 1,
  titles,
  season: "FALL",
  seasonYear: 2026,
  anidbId: null,
  ...over,
});

const input = (titles: string[], over: Partial<MatchInput> = {}): MatchInput => ({
  sourceKey: "19777",
  titles,
  seasonLabel: "Autumn2026",
  year: 2026,
  ...over,
});

describe("normalizeTitle / dice", () => {
  it("ignores case, accents and punctuation but keeps kana and kanji", () => {
    expect(normalizeTitle("  Yasei no Last-Boss ga Arawareta! ")).toBe("yasei no last boss ga arawareta");
    expect(normalizeTitle("Café Ｔｏｋｙｏ")).toBe("cafe tokyo");
    expect(normalizeTitle("野生のラスボスが現れた！")).toBe("野生のラスボスが現れた");
  });

  it("scores identical strings 1 and disjoint ones 0", () => {
    expect(dice("abc", "abc")).toBe(1);
    expect(dice("abcd", "wxyz")).toBe(0);
    expect(dice("", "abc")).toBe(0);
    expect(dice("night", "nacht")).toBeGreaterThan(0.2);
  });
});

describe("scoreCandidate / classifyMatch", () => {
  const boss = cand("p503", ["Yasei no Last Boss ga Arawareta!", "A Wild Last Boss Appeared!"]);

  it("accepts an exact title in the same season and year automatically", () => {
    const ranked = rankCandidates(input(["Yasei no Last Boss ga Arawareta!"]), [boss, cand("p9", ["Totally Different Show"])]);
    const outcome = classifyMatch(ranked);
    expect(outcome.state).toBe("AUTO");
    expect(ranked[0].score).toBeGreaterThan(0.99);
  });

  it("sends the same title in another season to review (same franchise, different production)", () => {
    const season1 = cand("p501", ["Kusuriya"], { seasonYear: 2023, season: "FALL" });
    const outcome = classifyMatch(rankCandidates(input(["Kusuriya"], { year: 2026 }), [season1]));
    expect(outcome.state).toBe("PENDING");
  });

  it("sends close candidates to review instead of picking one", () => {
    const a = cand("p1", ["Hoshi wo Matsu"]);
    const b = cand("p2", ["Hoshi wo Matsu"]);
    expect(classifyMatch(rankCandidates(input(["Hoshi wo Matsu"]), [a, b])).state).toBe("PENDING");
  });

  it("creates a new production when nothing is plausible", () => {
    expect(classifyMatch(rankCandidates(input(["Forest of Mist"]), [boss])).state).toBe("NEW");
    expect(classifyMatch([]).state).toBe("NEW");
  });

  it("trusts an already confirmed AniDB link over titles", () => {
    const linked = cand("p77", ["Titulo Completamente Outro"], { anidbId: 19777 });
    expect(scoreCandidate(input(["Yasei no Last Boss"]), linked).score).toBe(1);
  });

  it("reweights only over criteria that have data", () => {
    const noSeason = cand("p5", ["Yasei no Last Boss ga Arawareta!"], { season: null, seasonYear: null });
    const result = scoreCandidate(input(["Yasei no Last Boss ga Arawareta!"]), noSeason);
    expect(result.detail.season).toBeNull();
    expect(result.detail.year).toBeNull();
    expect(result.score).toBe(1);
  });
});


describe("vínculo já confirmado (anidbId) não vale para uma época distante", () => {
  const linked = (over: Partial<MatchCandidate>) => cand("1", ["Obra Qualquer"], { anidbId: 19777, ...over });

  it("na mesma época (ou temporada vizinha) a identidade manda", () => {
    expect(scoreCandidate(input(["Titulo diferente"]), linked({ season: "FALL", seasonYear: 2026 })).score).toBe(1);
    expect(scoreCandidate(input(["Titulo diferente"], { seasonLabel: "Winter2026", year: 2026 }), linked({ season: "FALL", seasonYear: 2025 })).score).toBe(1);
  });

  it("um vínculo gravado por um lote com o ano errado (verão de 2026 para o HTML de verão de 2025) não manda mais", () => {
    const wrong = linked({ season: "SUMMER", seasonYear: 2026 });
    expect(scoreCandidate(input(["Titulo diferente"], { seasonLabel: "Summer2025", year: 2025 }), wrong).score).toBeLessThan(0.92);
  });

  it("sem época conhecida na obra, a identidade continua valendo", () => {
    expect(scoreCandidate(input(["Titulo diferente"]), linked({ season: null, seasonYear: null })).score).toBe(1);
  });
});

describe("temporadas escritas de jeitos diferentes (AniDB × AniList)", () => {
  const winter = { season: "WINTER", seasonYear: 2024 } as const;
  const tsukimichi2 = cand("p139518", ["Tsuki ga Michibiku Isekai Douchuu 2nd Season", "TSUKIMICHI -Moonlit Fantasy- Season 2"], winter);
  const atWinter = { seasonLabel: "Winter2024", year: 2024 } as const;

  it("'Dai Ni Maku' do AniDB casa sozinho com '2nd Season' da AniList na mesma temporada", () => {
    const ranked = rankCandidates(input(["Tsuki ga Michibiku Isekai Douchuu Dai Ni Maku"], atWinter), [tsukimichi2]);
    expect(classifyMatch(ranked).state).toBe("AUTO");
  });

  it("'Season 2', 'Second Season' e '第二期' também valem como a temporada 2", () => {
    for (const title of ["Tsuki ga Michibiku Isekai Douchuu Season 2", "Tsuki ga Michibiku Isekai Douchuu Second Season", "Tsuki ga Michibiku Isekai Douchuu 第二期"]) {
      expect(classifyMatch(rankCandidates(input([title], atWinter), [tsukimichi2])).state).toBe("AUTO");
    }
  });

  it("a 1ª temporada nunca casa sozinha com a 2ª (vai para revisão)", () => {
    const first = cand("p1", ["Tsuki ga Michibiku Isekai Douchuu"], winter);
    const outcome = classifyMatch(rankCandidates(input(["Tsuki ga Michibiku Isekai Douchuu Dai Ni Maku"], atWinter), [first]));
    expect(outcome.state).not.toBe("AUTO");
    const second = classifyMatch(rankCandidates(input(["Tsuki ga Michibiku Isekai Douchuu"], atWinter), [tsukimichi2]));
    expect(second.state).not.toBe("AUTO");
  });

  it("com as duas temporadas no catálogo, a 2ª escolhe a 2ª", () => {
    const first = cand("p1", ["Tsuki ga Michibiku Isekai Douchuu"], { season: "SUMMER", seasonYear: 2021 });
    const ranked = rankCandidates(input(["Tsuki ga Michibiku Isekai Douchuu Dai Ni Maku"], atWinter), [first, tsukimichi2]);
    expect(ranked[0].candidate.id).toBe("p139518");
    expect(classifyMatch(ranked).state).toBe("AUTO");
  });
});

describe("romanizações do mesmo título", () => {
  it("looseKey junta as variações comuns", () => {
    expect(looseKey("Bishoujo Muzai Pirates")).toBe(looseKey("Bishoujyo Muzai♡Pirates"));
    expect(looseKey("Ao Ashi")).toBe(looseKey("Aoashi"));
    expect(looseKey("Oomuro-ke")).toBe(looseKey("Omuro ke"));
    expect(looseKey("Shudan o Erande")).toBe(looseKey("Shudan wo Erande"));
    expect(looseKey("Kakkou no Iinazuke")).not.toBe(looseKey("Cuckoo no Iinazuke"));
  });

  it("título só com a grafia diferente conta como idêntico no score", () => {
    const c = cand("p167743", ["Bishoujyo Muzai♡Pirates", "Bishoujyo Muzai Pirates"], { season: "SUMMER", seasonYear: 2023 });
    const [best] = rankCandidates(input(["Bishoujo Muzai Pirates"], { seasonLabel: "Summer2023", year: 2023 }), [c]);
    expect(best.detail.title).toBeGreaterThanOrEqual(0.97);
  });

  it("títulos curtos demais não são tratados como iguais só por perderem os espaços", () => {
    expect(looseKey("A B").length).toBeLessThan(5);
  });
});
