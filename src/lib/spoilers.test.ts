import { describe, expect, it } from "vitest";
import { hasInlineSpoiler, maskSpoilers, parseSpoilerEpisode, splitSpoilers, spoilerLabel, stripSpoilers, truncateKeepingSpoilers } from "./spoilers";

describe("splitSpoilers", () => {
  it("separa os trechos entre barras duplas", () => {
    expect(splitSpoilers("No fim, ||o Himmel morre|| e ela chora.")).toEqual([
      { spoiler: false, text: "No fim, " },
      { spoiler: true, text: "o Himmel morre" },
      { spoiler: false, text: " e ela chora." },
    ]);
  });

  it("aceita vários trechos e quebra de linha dentro do trecho", () => {
    const parts = splitSpoilers("||um||, dois e ||três\nquatro||");
    expect(parts.filter((p) => p.spoiler).map((p) => p.text)).toEqual(["um", "três\nquatro"]);
  });

  it("barras soltas, sem par ou só com espaço não viram spoiler", () => {
    expect(splitSpoilers("a || b")).toEqual([{ spoiler: false, text: "a || b" }]);
    expect(splitSpoilers("||   ||")).toEqual([{ spoiler: false, text: "||   ||" }]);
    expect(hasInlineSpoiler("sem nada")).toBe(false);
    expect(hasInlineSpoiler("||sim||")).toBe(true);
  });
});

describe("maskSpoilers / stripSpoilers", () => {
  it("prévias trocam o trecho por [spoiler]", () => {
    expect(maskSpoilers("Final: ||ela vence|| :)")).toBe("Final: [spoiler] :)");
  });
  it("hashtags de dentro do trecho somem antes de serem lidas", () => {
    expect(stripSpoilers("oi ||#FernVence|| #Frieren")).toBe("oi   #Frieren");
  });
});

describe("parseSpoilerEpisode", () => {
  it("aceita de 1 a 9999 (número ou texto) e vazio = nada", () => {
    expect(parseSpoilerEpisode(18)).toBe(18);
    expect(parseSpoilerEpisode(" 7 ")).toBe(7);
    expect(parseSpoilerEpisode("")).toBeNull();
    expect(parseSpoilerEpisode(undefined)).toBeNull();
  });
  it("recusa zero, negativo, fração e texto", () => {
    for (const bad of [0, -1, 2.5, "dez", 10000]) expect(parseSpoilerEpisode(bad)).toBeUndefined();
  });
});

describe("spoilerLabel", () => {
  it("diz a obra e até onde, quando se sabe", () => {
    expect(spoilerLabel({ work: "Frieren", episode: 18 })).toBe("Spoiler de Frieren · até o episódio 18");
    expect(spoilerLabel({ work: "Frieren" })).toBe("Spoiler de Frieren");
    expect(spoilerLabel({ episode: 3 })).toBe("Spoiler · até o episódio 3");
    expect(spoilerLabel()).toBe("Spoiler");
  });
});

describe("truncateKeepingSpoilers", () => {
  it("não corta um trecho de spoiler ao meio: ele fica inteiro ou de fora", () => {
    const text = "abc ||segredo longo|| fim";
    expect(truncateKeepingSpoilers(text, 8)).toEqual({ text: "abc ", truncated: true });
    expect(truncateKeepingSpoilers(text, 17)).toEqual({ text: "abc ||segredo longo||", truncated: true });
    expect(truncateKeepingSpoilers(text, 19)).toEqual({ text: "abc ||segredo longo|| f", truncated: true });
    expect(truncateKeepingSpoilers(text, 100)).toEqual({ text, truncated: false });
  });
  it("texto comum corta normalmente", () => {
    expect(truncateKeepingSpoilers("0123456789", 4)).toEqual({ text: "0123", truncated: true });
  });
});
