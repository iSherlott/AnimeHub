import { describe, expect, it } from "vitest";
import { classifyMatch, dice, normalizeTitle, rankCandidates, scoreCandidate, type MatchCandidate, type MatchInput } from "./matching";

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
