import { describe, expect, it } from "vitest";
import { baseTitle, matchFeedToAnimes, parseNewsFeed } from "./newsRss";

const XML = `<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0"><channel><title>ANN</title>
  <item><title>Kusuriya no Hitorigoto Season 3 Reveals Cast</title><link>https://www.animenewsnetwork.com/news/2026-10-09/a/.1</link>
    <description>&lt;cite&gt;The Apothecary Diaries&lt;/cite&gt; adds voices &amp; staff</description><pubDate>Fri, 09 Oct 2026 10:00:00 -0400</pubDate><category>Anime</category></item>
  <item><title>Japan's Video Game Rankings</title><link>https://www.animenewsnetwork.com/news/2026-10-10/b/.2</link><description>Ranking</description><pubDate>Sat, 10 Oct 2026 15:15:00 -0400</pubDate></item>
  <item><title>Insecure</title><link>http://example.com/c</link><pubDate>Sat, 10 Oct 2026 15:15:00 -0400</pubDate></item>
  <item><title>Bad date</title><link>https://example.com/d</link><pubDate>not a date</pubDate></item>
</channel></rss>`;

describe("parseNewsFeed", () => {
  it("lê itens https com título e data válidos, em texto puro", () => {
    const items = parseNewsFeed(XML);
    expect(items.map((i) => i.url)).toEqual(["https://www.animenewsnetwork.com/news/2026-10-09/a/.1", "https://www.animenewsnetwork.com/news/2026-10-10/b/.2"]);
    expect(items[0]).toMatchObject({ category: "Anime", excerpt: "The Apothecary Diaries adds voices & staff" });
    expect(items[0].publishedAt.toISOString()).toBe("2026-10-09T14:00:00.000Z");
  });

  it("devolve vazio para XML inválido ou sem itens", () => {
    expect(parseNewsFeed("<html>não é rss</html>")).toEqual([]);
    expect(parseNewsFeed("")).toEqual([]);
  });
});

describe("baseTitle", () => {
  it.each([
    ["Kusuriya no Hitorigoto 3rd Season", "kusuriya no hitorigoto"],
    ["Ao no Hako Season 2", "ao no hako"],
    ["Yasei no Last Boss ga Arawareta! (2026)", "yasei no last boss ga arawareta"],
    ["Dawang Raoming 3", "dawang raoming"],
  ])("%s", (title, expected) => {
    expect(baseTitle(title)).toBe(expected);
  });
});

describe("matchFeedToAnimes", () => {
  const items = parseNewsFeed(XML);

  it("liga a notícia à obra pelo título (também sem o sufixo de temporada) ou pelo título em inglês", () => {
    const byRomaji = matchFeedToAnimes(items, [{ anilistId: 1, titles: ["Kusuriya no Hitorigoto 3rd Season"] }]);
    expect(byRomaji.get(1)?.map((i) => i.title)).toEqual(["Kusuriya no Hitorigoto Season 3 Reveals Cast"]);
    const byEnglish = matchFeedToAnimes(items, [{ anilistId: 2, titles: ["Kusuriya", "The Apothecary Diaries"] }]);
    expect(byEnglish.get(2)).toHaveLength(1);
  });

  it("ignora títulos curtos demais e obras que não aparecem", () => {
    const result = matchFeedToAnimes(items, [
      { anilistId: 3, titles: ["Ranking"] }, // < 8 letras: genérico demais
      { anilistId: 4, titles: ["Outra Obra Qualquer"] },
    ]);
    expect(result.size).toBe(0);
  });

  it("não casa no meio de uma palavra", () => {
    const result = matchFeedToAnimes(items, [{ anilistId: 5, titles: ["Hitorigot"] }]);
    expect(result.size).toBe(0);
  });
});
