import { describe, expect, it } from "vitest";
import { dedupeByNormalizedTitle, mergeGenres, pickAnidbTitles } from "./identityResolution";

describe("mergeGenres", () => {
  it("une gêneros de várias fontes sem duplicar", () => {
    const result = mergeGenres(["Isekai"], [["Isekai", "Comedy"], ["Comedy", "Mecha"]]);
    expect(result.sort()).toEqual(["Comedy", "Isekai", "Mecha"]);
  });

  it("retorna só os existentes quando não há fontes novas", () => {
    expect(mergeGenres(["Isekai"], [])).toEqual(["Isekai"]);
  });

  // Epic 3: normaliza pro vocabulário fechado, então (1) termos sem
  // mapeamento somem mesmo vindo de `existing` (autocura de dado gravado
  // antes da taxonomia existir) e (2) sinônimos de fontes diferentes pro
  // mesmo conceito não viram duas entradas.
  it("descarta termos sem mapeamento, inclusive os que já estavam salvos", () => {
    expect(mergeGenres(["Action", "Isekai"], [["Drama"]])).toEqual(["Isekai"]);
  });

  it("não duplica quando duas fontes mandam sinônimos do mesmo gênero", () => {
    const result = mergeGenres([], [["Sci-Fi"], ["Science Fiction"]]);
    expect(result).toEqual(["Sci-fi"]);
  });
});

describe("pickAnidbTitles", () => {
  it("escolhe por código de idioma, ignorando os que não batem", () => {
    const result = pickAnidbTitles([
      { language: "x-jat", title: "Jujutsu Kaisen" },
      { language: "ja", title: "呪術廻戦" },
      { language: "pt-br", title: "Jujutsu Kaisen (PT)" },
      { language: "en", title: "Jujutsu Kaisen (EN)" },
    ]);
    expect(result).toEqual({
      pt: "Jujutsu Kaisen (PT)",
      ja: "呪術廻戦",
      en: "Jujutsu Kaisen (EN)",
    });
  });

  it("retorna null pros idiomas sem título correspondente", () => {
    const result = pickAnidbTitles([{ language: "ja", title: "呪術廻戦" }]);
    expect(result).toEqual({ pt: null, ja: "呪術廻戦", en: null });
  });
});

describe("dedupeByNormalizedTitle", () => {
  it("mantém o candidato com anilistId quando há empate de título", () => {
    const kept = dedupeByNormalizedTitle([
      { key: "kitsu-1", title: "Jujutsu Kaisen", hasAnilistId: false },
      { key: "anilist-1", title: "jujutsu kaisen", hasAnilistId: true },
    ]);
    expect(kept).toEqual(["anilist-1"]);
  });

  it("não mexe em títulos diferentes", () => {
    const kept = dedupeByNormalizedTitle([
      { key: "a", title: "Kaiju No. 8", hasAnilistId: true },
      { key: "b", title: "Jujutsu Kaisen", hasAnilistId: false },
    ]);
    expect(kept.sort()).toEqual(["a", "b"]);
  });

  it("primeiro visto vence quando nenhum tem anilistId", () => {
    const kept = dedupeByNormalizedTitle([
      { key: "first", title: "Re:Zero", hasAnilistId: false },
      { key: "second", title: "re:zero", hasAnilistId: false },
    ]);
    expect(kept).toEqual(["first"]);
  });
});
