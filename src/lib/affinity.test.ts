import { describe, expect, it } from "vitest";
import { computeAffinity } from "./affinity";

const w = (key: string, genres: string[]) => ({ key, title: `Obra ${key}`, titleEnglish: null, coverImage: null, href: `/anime/${key}`, genres });

describe("afinidade entre duas listas", () => {
  it("listas iguais dão 100%", () => {
    const list = [w("1", ["Ação"]), w("2", ["Drama"]), w("3", ["Comédia"])];
    expect(computeAffinity(list, list)).toMatchObject({ kind: "ok", percent: 100, commonCount: 3, onlyTheirs: [] });
  });

  it("nada em comum e gêneros diferentes dão 0%; o que só a outra pessoa vê aparece", () => {
    const result = computeAffinity([w("1", ["Ação"]), w("2", ["Ação"]), w("3", ["Ação"])], [w("4", ["Drama"]), w("5", ["Drama"]), w("6", ["Drama"])]);
    expect(result).toMatchObject({ kind: "ok", percent: 0, commonCount: 0, sharedGenres: [] });
    expect(result.kind === "ok" && result.onlyTheirs.map((x) => x.key)).toEqual(["4", "5", "6"]);
  });

  it("obras em comum valem 60% (sobre a lista menor) e gêneros 40%", () => {
    const mine = [w("1", ["Ação"]), w("2", ["Ação"]), w("3", ["Drama"]), w("4", ["Drama"])];
    const theirs = [w("1", ["Ação"]), w("2", ["Ação"]), w("9", ["Comédia"])];
    const result = computeAffinity(mine, theirs);
    // 2 de 3 em comum = 0,667 × 60 = 40; gêneros: cos([2,2,0],[2,0,1]) = 4/(√8·√5) ≈ 0,632 × 40 ≈ 25 → 65.
    expect(result).toMatchObject({ kind: "ok", percent: 65, commonCount: 2, sharedGenres: ["Ação"] });
  });

  it("com menos de 3 obras em alguma lista não compara", () => {
    expect(computeAffinity([w("1", [])], [w("1", []), w("2", []), w("3", [])])).toEqual({ kind: "small" });
  });
});
