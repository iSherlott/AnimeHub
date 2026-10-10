import { describe, expect, it } from "vitest";
import { splitForTranslation, translateText } from "./translate";

describe("splitForTranslation", () => {
  it("mantém texto curto em um pedaço só", () => {
    expect(splitForTranslation("Uma frase curta.")).toEqual(["Uma frase curta."]);
  });

  it("agrupa frases sem passar do limite e nunca corta palavra", () => {
    const text = "Primeira frase aqui. Segunda frase aqui. Terceira frase aqui.";
    const parts = splitForTranslation(text, 45);
    expect(parts.every((p) => p.length <= 45)).toBe(true);
    expect(parts.join(" ")).toBe(text);
  });

  it("preserva a quebra entre parágrafos", () => {
    expect(splitForTranslation("Um.\n\nDois.")).toEqual(["Um.", "\n\n", "Dois."]);
  });

  it("corta frase gigante nos espaços", () => {
    const long = "palavra ".repeat(30).trim();
    const parts = splitForTranslation(long, 50);
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 50)).toBe(true);
  });
});

describe("translateText", () => {
  const ok = (translated: string) => async () => Response.json({ responseStatus: 200, responseData: { translatedText: translated } });

  it("traduz cada pedaço e remonta o texto", async () => {
    const fetcher = (async (url: string) => {
      const q = decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
      return Response.json({ responseStatus: 200, responseData: { translatedText: `PT(${q})` } });
    }) as unknown as typeof fetch;
    expect(await translateText("Hello.\n\nWorld.", "pt", fetcher)).toBe("PT(Hello.)\n\nPT(World.)");
  });

  it("pede o par en|ja para japonês", async () => {
    let called = "";
    const fetcher = (async (url: string) => {
      called = url;
      return ok("やあ")();
    }) as unknown as typeof fetch;
    await translateText("Hi.", "ja", fetcher);
    expect(called).toContain("langpair=en|ja");
  });

  it("falha (em vez de devolver aviso de cota) quando o MyMemory estoura a cota", async () => {
    const fetcher = (async () => Response.json({ responseStatus: 429, responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS" } })) as unknown as typeof fetch;
    await expect(translateText("Hi.", "pt", fetcher)).rejects.toThrow();
  });
});
