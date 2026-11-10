import { describe, expect, it } from "vitest";
import { fetchOfficialNews, findNewsListUrl, isArticleUrl, parseNewsList, parseOfficialFeed, parseSiteDate, robotsAllows, type Fetcher } from "@/lib/officialNews";

// Estruturas copiadas das famílias de site vistas na pesquisa (textos trocados).
const LIST_DATE_IN_LINK = `
  <ul class="p-news__list">
    <li><a href="./?article_id=71659" class="p-news__list-inner"><div class="p-news__list-date">2026.11.08</div><div class="p-news__list-ttl">OPテーマ試聴動画公開！</div></a></li>
    <li><a href="./?article_id=71612"><div class="p-news__list-date">2026.11.01</div><div class="p-news__list-ttl">EDテーマ公開！</div></a></li>
  </ul>
  <a href="./?category_id=3">MUSIC</a>`;
const LIST_TABLE = `
  <script>/* 2019/04/15 - 10:42 */</script>
  <table><tr class="bg_a"><td class="day">2026/11/07</td><td class="read"><div class="title"><span class="new_ic"><a href="../news/index00350000.html">第７話 あらすじ公開！</a></span></div></td></tr>
  <tr class="bg_b"><td class="day">2026/11/06</td><td class="read"><div class="title"><a href="../news/index00450000.html">一挙配信決定！</a></div></td></tr></table>
  <a href="../news/index.html">一覧</a>`;
const LIST_DATE_OUTSIDE = `
  <ul class="news_list">
    <li class="news_list_item"><span class="date">2026.11.08</span><span class="title"><a href="https://sh.example.jp/obra/news/132">第6話 先行カット解禁!!</a></span></li>
    <li class="news_list_item"><span class="date">2026.11.01</span><span class="title"><a href="https://sh.example.jp/obra/news/130">第5話 先行カット解禁!!</a></span></li>
  </ul>`;

describe("parseSiteDate", () => {
  it("as grafias dos sites, ao meio-dia no Japão", () => {
    for (const t of ["2026.11.07", "2026/11/7", "2026-11-07", "2026年11月7日"]) expect(parseSiteDate(t)?.toISOString()).toBe("2026-11-07T03:00:00.000Z");
    expect(parseSiteDate("2026.13.01")).toBeNull();
    expect(parseSiteDate("2026.02.31")).toBeNull();
    expect(parseSiteDate("sem data")).toBeNull();
  });
});

describe("parseNewsList (a lista de notícias)", () => {
  it("data dentro do link, com o título do elemento de título; categoria não é matéria", () => {
    const items = parseNewsList(LIST_DATE_IN_LINK, "https://nama.example.com/news/");
    expect(items.map((i) => [i.url, i.title])).toEqual([
      ["https://nama.example.com/news/?article_id=71659", "OPテーマ試聴動画公開！"],
      ["https://nama.example.com/news/?article_id=71612", "EDテーマ公開！"],
    ]);
  });

  it("tabela com a data numa célula e o link noutra; a data do script não conta; a própria lista não é matéria", () => {
    const items = parseNewsList(LIST_TABLE, "https://tempal.example.net/news/index.html");
    expect(items.map((i) => [i.url, i.title, i.publishedAt.toISOString().slice(0, 10)])).toEqual([
      ["https://tempal.example.net/news/index00350000.html", "第７話 あらすじ公開！", "2026-11-07"],
      ["https://tempal.example.net/news/index00450000.html", "一挙配信決定！", "2026-11-06"],
    ]);
  });

  it("data fora do link, no mesmo item da lista", () => {
    const items = parseNewsList(LIST_DATE_OUTSIDE, "https://sh.example.jp/obra/news");
    expect(items.map((i) => i.url)).toEqual(["https://sh.example.jp/obra/news/132", "https://sh.example.jp/obra/news/130"]);
    expect(items[0].title).toBe("第6話 先行カット解禁!!");
  });

  it("a data da matéria é a primeira do item; data dentro do título é conteúdo; data no futuro não entra", () => {
    const html = `
      <li><span class="date">2026/11/04</span><a href="index00370000.html">Blu-ray Boxが2027年3月26日に発売決定！</a></li>
      <li><a href="905"><span>2026</span> <span>11.02</span> <p class="news-title">ジャンプフェスタ出展</p></a></li>
      <li><a href="999"><span>2027.01.27</span> 未来の日付</a></li>`;
    const items = parseNewsList(html, "https://obra.example.com/news/", new Date("2026-11-09T12:00:00Z"));
    expect(items.map((i) => [i.title, i.publishedAt.toISOString().slice(0, 10)])).toEqual([
      ["Blu-ray Boxが2027年3月26日に発売決定！", "2026-11-04"],
      ["ジャンプフェスタ出展", "2026-11-02"],
    ]);
  });

  it("link de outro site ou fora das notícias não entra", () => {
    const html = `<li>2026.11.01 <a href="https://outro.example.com/news/1">x</a></li><li>2026.11.02 <a href="/goods/1">y</a></li>`;
    expect(parseNewsList(html, "https://obra.example.com/news/")).toEqual([]);
  });
});

describe("isArticleUrl", () => {
  const list = new URL("https://obra.example.com/news/");
  it("matérias, sim; lista, categoria e página da lista, não", () => {
    expect(isArticleUrl(new URL("https://obra.example.com/news/603/"), list)).toBe(true);
    expect(isArticleUrl(new URL("https://obra.example.com/news/detail.php?id=1"), list)).toBe(true);
    expect(isArticleUrl(new URL("https://obra.example.com/news/"), list)).toBe(false);
    expect(isArticleUrl(new URL("https://obra.example.com/news/?category_id=1"), list)).toBe(false);
    expect(isArticleUrl(new URL("https://obra.example.com/news/page/2/"), list)).toBe(false);
    expect(isArticleUrl(new URL("https://obra.example.com/2024/07/12/hello-world/"), list)).toBe(false);
  });
});

describe("findNewsListUrl", () => {
  it("o link mais curto que termina em news, de preferência dentro do caminho da obra", () => {
    const home = `<a href="/news/">todas</a><a href="/season2/news/">temporada</a><a href="/season2/news/12">uma</a><a href="https://x.com/obra">X</a>`;
    expect(findNewsListUrl(home, "https://obra.example.com/season2/")).toBe("https://obra.example.com/season2/news/");
    expect(findNewsListUrl(`<a href="news/index.html">News</a>`, "https://obra.example.com/")).toBe("https://obra.example.com/news/index.html");
    expect(findNewsListUrl(`<a href="/story/">Story</a>`, "https://obra.example.com/")).toBeNull();
  });
});

describe("parseOfficialFeed", () => {
  it("RSS do WordPress: só o que está no caminho de notícias (o 'Hello world!' de exemplo fica de fora)", () => {
    const rss = `<?xml version="1.0"?><rss version="2.0"><channel>
      <item><title>第1クールメインPVが公開！</title><link>https://obra.example.com/news/603/</link><pubDate>Tue, 01 Sep 2026 23:01:47 +0000</pubDate><description><![CDATA[<p>PVが解禁！</p>]]></description></item>
      <item><title>Hello world!</title><link>https://obra.example.com/2024/07/12/hello-world/</link><pubDate>Fri, 12 Jul 2024 09:18:45 +0000</pubDate></item>
    </channel></rss>`;
    expect(parseOfficialFeed(rss, "https://obra.example.com/news/")).toEqual([
      { url: "https://obra.example.com/news/603/", title: "第1クールメインPVが公開！", excerpt: "PVが解禁！", publishedAt: new Date("2026-09-01T23:01:47Z") },
    ]);
  });

  it("Atom", () => {
    const atom = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Key visual</title><link href="https://obra.example.com/news/9"/><updated>2026-11-01T10:00:00Z</updated></entry></feed>`;
    expect(parseOfficialFeed(atom, "https://obra.example.com/news/").map((i) => i.url)).toEqual(["https://obra.example.com/news/9"]);
  });
});

describe("robotsAllows", () => {
  it("segue o grupo de todos os robôs, com a regra mais longa vencendo", () => {
    const robots = "User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nDisallow: /wp/wp-admin/\nAllow: /wp/wp-admin/admin-ajax.php\nDisallow: /private";
    expect(robotsAllows(robots, "/news/")).toBe(true);
    expect(robotsAllows(robots, "/wp/wp-admin/x")).toBe(false);
    expect(robotsAllows(robots, "/wp/wp-admin/admin-ajax.php")).toBe(true);
    expect(robotsAllows(robots, "/private/news")).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow: /", "/news/")).toBe(false);
    expect(robotsAllows("", "/news/")).toBe(true);
  });
});

describe("fetchOfficialNews", () => {
  const site = (pages: Record<string, string>): { fetcher: Fetcher; asked: string[] } => {
    const asked: string[] = [];
    return {
      asked,
      fetcher: async (url) => {
        asked.push(url);
        const body = pages[url];
        return body === undefined ? { status: 404, url, contentType: "text/html", body: "" } : { status: 200, url, contentType: "text/html", body };
      },
    };
  };

  it("WordPress: usa o feed das notícias (news/feed/), não a lista", async () => {
    const { fetcher } = site({
      "https://wp.example.com/": `<link href="/wp-content/x.css"><a href="/news/">NEWS</a>`,
      "https://wp.example.com/news/": LIST_DATE_OUTSIDE,
      "https://wp.example.com/news/feed/": `<rss><channel><item><title>PV公開</title><link>https://wp.example.com/news/1/</link><pubDate>Mon, 02 Nov 2026 01:00:00 +0000</pubDate></item></channel></rss>`,
    });
    expect((await fetchOfficialNews("https://wp.example.com/", fetcher))?.map((i) => i.title)).toEqual(["PV公開"]);
  });

  it("sem feed, lê a lista; o robots.txt que proíbe a lista é respeitado", async () => {
    const pages = { "https://obra.example.com/": `<a href="news/">NEWS</a>`, "https://obra.example.com/news/": LIST_DATE_IN_LINK.replace(/\.\/\?/g, "/news/?") };
    expect((await fetchOfficialNews("https://obra.example.com/", site(pages).fetcher))?.length).toBe(2);
    const blocked = site({ ...pages, "https://obra.example.com/robots.txt": "User-agent: *\nDisallow: /news/" });
    expect(await fetchOfficialNews("https://obra.example.com/", blocked.fetcher)).toBeNull();
    expect(blocked.asked).not.toContain("https://obra.example.com/news/");
  });

  it("endereço de rede interna nunca é lido", async () => {
    const { fetcher, asked } = site({});
    expect(await fetchOfficialNews("http://127.0.0.1/", fetcher)).toBeNull();
    expect(await fetchOfficialNews("http://localhost:3000/", fetcher)).toBeNull();
    expect(asked).toEqual([]);
  });
});
