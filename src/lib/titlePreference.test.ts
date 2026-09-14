import { describe, it, expect } from "vitest";
import { resolveTitleTextLenient, type TitlePreference } from "@/lib/titlePreference";

const EN: TitlePreference = { language: "en", japaneseScript: "romaji" };
const PT: TitlePreference = { language: "pt", japaneseScript: "romaji" };
const JA_ROMAJI: TitlePreference = { language: "ja", japaneseScript: "romaji" };
const JA_KANJI: TitlePreference = { language: "ja", japaneseScript: "kanji" };

describe("resolveTitleTextLenient", () => {
  const full = {
    titleRomaji: "Romaji",
    titleEnglish: "English",
    titleNative: "Native",
    titlePortuguese: "Portuguese",
  };

  it("picks the preferred field first when everything is populated", () => {
    expect(resolveTitleTextLenient(EN, full, "placeholder")).toBe("English");
    expect(resolveTitleTextLenient(PT, full, "placeholder")).toBe("Portuguese");
    expect(resolveTitleTextLenient(JA_ROMAJI, full, "placeholder")).toBe("Romaji");
    expect(resolveTitleTextLenient(JA_KANJI, full, "placeholder")).toBe("Native");
  });

  // Regressão: o TitleSet "forjado" que EpisodeGrid/NotificationBell usavam
  // antes colocava titleNative no slot de titleRomaji quando era o único
  // campo disponível — e a preferência "en" (padrão do app) lia esse slot
  // como se fosse romaji de verdade, exibindo texto em japonês como se
  // fosse o título em inglês. Aqui, sem nenhum forjamento, "en"/"pt" nunca
  // atravessam pro nativo — caem pro placeholder em vez de trocar de
  // escrita em silêncio.
  it("falls back to the placeholder under 'en'/'pt' instead of leaking a native-only title", () => {
    const nativeOnly = { titleRomaji: null, titleEnglish: null, titleNative: "進撃の巨人", titlePortuguese: null };
    expect(resolveTitleTextLenient(EN, nativeOnly, "Episódio 1")).toBe("Episódio 1");
    expect(resolveTitleTextLenient(PT, nativeOnly, "Episódio 1")).toBe("Episódio 1");
  });

  it("still lets 'ja' (either script) fall through to the native title when that's all that exists", () => {
    const nativeOnly = { titleRomaji: null, titleEnglish: null, titleNative: "進撃の巨人", titlePortuguese: null };
    expect(resolveTitleTextLenient(JA_ROMAJI, nativeOnly, "placeholder")).toBe("進撃の巨人");
    expect(resolveTitleTextLenient(JA_KANJI, nativeOnly, "placeholder")).toBe("進撃の巨人");
  });

  it("falls back to the placeholder when literally nothing is populated", () => {
    const empty = { titleRomaji: null, titleEnglish: null, titleNative: null, titlePortuguese: null };
    expect(resolveTitleTextLenient(EN, empty, "Episódio 1")).toBe("Episódio 1");
    expect(resolveTitleTextLenient(PT, empty, "Episódio 1")).toBe("Episódio 1");
    expect(resolveTitleTextLenient(JA_ROMAJI, empty, "Episódio 1")).toBe("Episódio 1");
    expect(resolveTitleTextLenient(JA_KANJI, empty, "Episódio 1")).toBe("Episódio 1");
  });

  it("degrades gracefully through the full priority chain for 'ja' romaji when romaji is missing", () => {
    const onlyEnglish = { titleRomaji: null, titleEnglish: "English", titleNative: null, titlePortuguese: null };
    expect(resolveTitleTextLenient(JA_ROMAJI, onlyEnglish, "placeholder")).toBe("English");
  });

  it("degrades gracefully for 'pt' when titlePortuguese and titleEnglish are both missing", () => {
    const onlyRomaji = { titleRomaji: "Romaji", titleEnglish: null, titleNative: null, titlePortuguese: null };
    expect(resolveTitleTextLenient(PT, onlyRomaji, "placeholder")).toBe("Romaji");
  });

  it("treats an empty string field the same as a missing one", () => {
    const emptyString = { titleRomaji: "", titleEnglish: "English", titleNative: null, titlePortuguese: null };
    expect(resolveTitleTextLenient(EN, emptyString, "placeholder")).toBe("English");
  });
});
