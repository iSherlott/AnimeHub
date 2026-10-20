import { describe, expect, it } from "vitest";
import {
  dedupeByNormalizedTitle,
  mergeGenres,
  pickAnidbTitles,
  titlesLikelyMatch,
} from "./identityResolution";

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
    expect(mergeGenres(["Action", "Isekai"], [["Fantasy"]])).toEqual(["Isekai"]);
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

describe("titlesLikelyMatch", () => {
  // Epic 18, 6ª rodada de auditoria: uma busca por texto (Kitsu/Jikan/
  // Shikimori) quase sempre devolve *algum* resultado, mesmo sem nada
  // parecido de verdade — sem essa checagem, o 1º resultado era aceito
  // cego e corrompia capa/banner/sinopse com dados de outro anime.
  it("aceita match exato (ignorando maiúsculas/acentos)", () => {
    expect(titlesLikelyMatch("One Piece", ["one piece"])).toBe(true);
    expect(titlesLikelyMatch("Rézero", ["rezero"])).toBe(true);
  });

  it("aceita quando um título contém o outro por inteiro (subtítulo/temporada)", () => {
    expect(
      titlesLikelyMatch("Attack on Titan", ["Attack on Titan: Final Season"])
    ).toBe(true);
  });

  it("aceita com sobreposição de palavras mesmo sem um conter o outro por inteiro (ordem diferente)", () => {
    // Nenhum título é substring do outro depois de normalizado — só o
    // caminho de sobreposição de palavras (>=60%) aceita este caso.
    expect(titlesLikelyMatch("Boku no Hero Academia", ["Hero Academia Boku no"])).toBe(true);
  });

  it("rejeita títulos sem relação nenhuma", () => {
    expect(titlesLikelyMatch("No Cover Test Anime", ["Gate: Jieitai Kanochi nite"])).toBe(
      false
    );
  });

  // Regressão: a checagem de "um contém o outro" rodava sobre a string
  // crua, então um título curto de verdade "casava" com qualquer título
  // mais comprido que só por acaso contivesse essas letras em sequência no
  // meio de outra palavra — o oposto do que essa função existe pra
  // garantir. A checagem precisa respeitar fronteira de palavra.
  it("não deixa um título curto casar por estar embutido no meio de outra palavra", () => {
    expect(titlesLikelyMatch("Air", ["Fair Game"])).toBe(false);
    expect(titlesLikelyMatch("K", ["Kuroko no Basket"])).toBe(false);
  });

  it("rejeita quando não há nenhum candidato utilizável", () => {
    expect(titlesLikelyMatch("Alguma Coisa", [null, undefined, ""])).toBe(false);
  });

  it("verifica todos os candidatos, não só o primeiro", () => {
    expect(titlesLikelyMatch("One Piece", [null, "One Piece"])).toBe(true);
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
