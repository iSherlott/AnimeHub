import { describe, expect, it } from "vitest";
import { normalizeTwitterUrl, parseTwitterLinks, twitterLanguageLabel, twitterLinksFrom } from "@/lib/twitterLinks";

describe("X (Twitter) oficial da obra", () => {
  it("twitter.com e x.com viram o mesmo endereço x.com/<conta>", () => {
    expect(normalizeTwitterUrl("https://twitter.com/kusuriya_PR")).toEqual({ handle: "kusuriya_PR", url: "https://x.com/kusuriya_PR" });
    expect(normalizeTwitterUrl("https://x.com/aonohako_PR/")).toEqual({ handle: "aonohako_PR", url: "https://x.com/aonohako_PR" });
    expect(normalizeTwitterUrl("http://mobile.twitter.com/@tenken_official?lang=ja")?.handle).toBe("tenken_official");
    expect(normalizeTwitterUrl("https://x.com/hashtag/anime")).toBeNull();
    expect(normalizeTwitterUrl("https://instagram.com/obra")).toBeNull();
    expect(normalizeTwitterUrl("javascript:alert(1)")).toBeNull();
  });

  it("dos links da AniList: só os de Twitter, sem repetir a conta, o japonês primeiro", () => {
    const links = twitterLinksFrom([
      { site: "Twitter", type: "SOCIAL", language: "English", url: "https://x.com/BlackClover_EN" },
      { site: "Official Site", type: "INFO", language: "Japanese", url: "http://bclover.jp/" },
      { site: "Twitter", type: "SOCIAL", language: "Japanese", url: "https://twitter.com/bclover_PR" },
      { site: "Twitter", type: "SOCIAL", language: "Japanese", url: "https://x.com/bclover_pr" },
      { site: "Twitter", type: "SOCIAL", language: null, url: "https://x.com/desativado", isDisabled: true },
    ]);
    expect(links).toEqual([
      { handle: "bclover_PR", url: "https://x.com/bclover_PR", language: "Japanese" },
      { handle: "BlackClover_EN", url: "https://x.com/BlackClover_EN", language: "English" },
    ]);
  });

  it("lê o guardado no catálogo e ignora o que não é X", () => {
    expect(parseTwitterLinks(JSON.stringify([{ url: "https://x.com/obra_PR", language: "Japanese" }, { url: "https://evil.example/x" }]))).toEqual([{ handle: "obra_PR", url: "https://x.com/obra_PR", language: "Japanese" }]);
    expect(parseTwitterLinks("não é json")).toEqual([]);
    expect(parseTwitterLinks(null)).toEqual([]);
  });

  it("a língua só aparece quando não é a conta japonesa", () => {
    expect(twitterLanguageLabel("Japanese")).toBeNull();
    expect(twitterLanguageLabel("English")).toBe("inglês");
    expect(twitterLanguageLabel(null)).toBeNull();
  });
});
