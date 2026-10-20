import { describe, expect, it } from "vitest";
import { isValidUserScore, siteScoreOf } from "./siteScore";

describe("siteScoreOf", () => {
  it("sem notas, a obra fica em 5", () => {
    expect(siteScoreOf([])).toEqual({ score: 5, votes: 0 });
  });

  it("uma nota só regula, não domina", () => {
    expect(siteScoreOf([10])).toEqual({ score: 6.3, votes: 1 });
    expect(siteScoreOf([0])).toEqual({ score: 3.8, votes: 1 });
  });

  it("com mais notas, aproxima-se da média real", () => {
    expect(siteScoreOf([9, 9, 9, 9, 9, 9]).score).toBe(7.7);
    expect(siteScoreOf(Array(60).fill(9)).score).toBe(8.8);
  });

  it("notas iguais a 5 mantêm 5", () => {
    expect(siteScoreOf([5, 5, 5]).score).toBe(5);
  });

  it("ignora nota fora de 0-10 ou não inteira", () => {
    expect(siteScoreOf([11, -1, 7.5, Number.NaN])).toEqual({ score: 5, votes: 0 });
  });
});

describe("isValidUserScore", () => {
  it("só aceita inteiros de 0 a 10", () => {
    expect(isValidUserScore(0)).toBe(true);
    expect(isValidUserScore(10)).toBe(true);
    expect(isValidUserScore(7.5)).toBe(false);
    expect(isValidUserScore("8")).toBe(false);
    expect(isValidUserScore(null)).toBe(false);
  });
});
