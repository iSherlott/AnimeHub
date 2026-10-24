import { describe, expect, it } from "vitest";
import { splitForTranslation, TranslationQuotaError, translateText, translationEngine } from "./translate";

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

  it("trechos em japonês não passam pelo tradutor e voltam intactos", async () => {
    const sent: string[] = [];
    const fetcher = (async (url: string) => {
      const q = decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
      sent.push(q);
      return Response.json({ responseStatus: 200, responseData: { translatedText: q.replace("Commercial", "Comercial") } });
    }) as unknown as typeof fetch;
    const text = "Commercial 1) 【デレステ】5周年CM　夢見 りあむ 篇【アイドルマスター】 (17 Sep 2020) and 新春特番.";
    expect(await translateText(text, "pt", fetcher)).toBe("Comercial 1) 【デレステ】5周年CM　夢見 りあむ 篇【アイドルマスター】 (17 Sep 2020) and 新春特番.");
    expect(sent.join("")).not.toMatch(/[぀-ヿ一-鿿]/);
  });

  it("falha se o tradutor perder um trecho protegido", async () => {
    const fetcher = (async () => Response.json({ responseStatus: 200, responseData: { translatedText: "sem marcador" } })) as unknown as typeof fetch;
    await expect(translateText("Song 夢見.", "pt", fetcher)).rejects.toThrow(/japonês/);
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

  it("distingue cota esgotada de um erro qualquer", async () => {
    const quota = (async () => Response.json({ responseStatus: 200, responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY" } })) as unknown as typeof fetch;
    await expect(translateText("Hi.", "pt", quota)).rejects.toBeInstanceOf(TranslationQuotaError);
    const limited = (async () => new Response("slow down", { status: 429 })) as unknown as typeof fetch;
    await expect(translateText("Hi.", "pt", limited)).rejects.toBeInstanceOf(TranslationQuotaError);
    const broken = (async () => new Response("oops", { status: 500 })) as unknown as typeof fetch;
    const error = await translateText("Hi.", "pt", broken).catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(TranslationQuotaError);
  });
});

describe("translationEngine", () => {
  it("usa o LibreTranslate quando há URL e o MyMemory quando não há", () => {
    const old = process.env.LIBRETRANSLATE_URL;
    try {
      process.env.LIBRETRANSLATE_URL = "http://localhost:5000";
      expect(translationEngine()).toBe("libretranslate");
      delete process.env.LIBRETRANSLATE_URL;
      expect(translationEngine()).toBe("mymemory");
    } finally {
      if (old === undefined) delete process.env.LIBRETRANSLATE_URL;
      else process.env.LIBRETRANSLATE_URL = old;
    }
  });
});
