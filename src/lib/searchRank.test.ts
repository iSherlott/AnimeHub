import { describe, expect, it } from "vitest";
import { rankTitleMatches, titleMatchTier } from "./searchRank";

const t = (id: string, titleRomaji: string, popularityRank: number | null = null, titleEnglish: string | null = null, titleNative: string | null = null) => ({ id, titleRomaji, titleEnglish, titleNative, popularityRank });

describe("titleMatchTier", () => {
  it("separa igual, começa com, palavra começa com, contém e não casa", () => {
    expect(titleMatchTier(["Naruto"], "naruto")).toBe(0);
    expect(titleMatchTier(["Naruto Shippuuden"], "naruto")).toBe(1);
    expect(titleMatchTier(["Boruto: Naruto Next Generations"], "naruto")).toBe(2);
    expect(titleMatchTier(["Narutomaki"], "maki")).toBe(3);
    expect(titleMatchTier(["Bleach"], "naruto")).toBeNull();
  });

  it("vale o melhor título entre romaji, inglês e nativo", () => {
    expect(titleMatchTier(["Shingeki no Kyojin", "Attack on Titan", null], "attack on titan")).toBe(0);
    expect(titleMatchTier(["進撃の巨人"], "進撃")).toBe(1);
  });

  it("busca vazia não casa com nada", () => {
    expect(titleMatchTier(["Naruto"], "  ")).toBeNull();
  });
});

describe("rankTitleMatches", () => {
  it("ordena pela relevância e desempata por popularidade e título", () => {
    const list = [
      t("a", "Boruto: Naruto Next Generations", 1),
      t("b", "Naruto Shippuuden", 5),
      t("c", "Naruto", 9),
      t("d", "Naruto Movie", 2),
      t("e", "Bleach", 1),
    ];
    expect(rankTitleMatches(list, "naruto").map((e) => e.id)).toEqual(["c", "d", "b", "a"]);
  });

  it("sem posição no ranking vai depois de quem tem", () => {
    const list = [t("x", "Obra Zeta"), t("y", "Obra Alfa", 3), t("z", "Obra Beta")];
    expect(rankTitleMatches(list, "obra").map((e) => e.id)).toEqual(["y", "z", "x"]);
  });
});
