import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));

import { articleImageCandidates, findArticleImage, fitsFeed, pickNewsImage } from "./newsImage";

describe("imagem da notícia (11/11)", () => {
  it("serve para o Feed: foto grande entre 3:5 e 2,2:1; banner-faixa, ícone e imagem pequena não", () => {
    expect(fitsFeed({ width: 1200, height: 630 })).toBe(true);
    expect(fitsFeed({ width: 460, height: 650 })).toBe(true);
    expect(fitsFeed({ width: 1900, height: 400 })).toBe(false);
    expect(fitsFeed({ width: 200, height: 200 })).toBe(false);
    expect(fitsFeed(undefined)).toBe(false);
  });

  it("lê og:image/twitter:image (na ordem), resolve o caminho e descarta logotipo, svg e http", () => {
    const html = `<html><head>
      <meta name="twitter:image" content="https://site.jp/tw.jpg">
      <meta content="/img/ogp.jpg?v=2" property="og:image">
      <meta property="og:image" content="https://site.jp/common/logo.png">
      <meta property="og:image:secure_url" content="https://cdn.site.jp/kv.svg">
      <meta property="og:image:url" content="http://site.jp/insecure.jpg">
      <link rel="image_src" href="https://site.jp/src.jpg">
    </head></html>`;
    expect(articleImageCandidates(html, "https://site.jp/news/1")).toEqual(["https://site.jp/img/ogp.jpg?v=2", "https://site.jp/tw.jpg", "https://site.jp/src.jpg"]);
  });

  it("abre a matéria só se o robots.txt deixa, e devolve a primeira imagem que serve", async () => {
    const pages: Record<string, string> = {
      "https://site.jp/robots.txt": "User-agent: *\nDisallow: /private/",
      "https://site.jp/news/1": `<meta property="og:image" content="https://site.jp/strip.jpg"><meta name="twitter:image" content="https://site.jp/kv.jpg">`,
    };
    const fetcher = vi.fn(async (url: string) => (pages[url] ? { status: 200, url, contentType: "text/html", body: pages[url] } : { status: 404, url, contentType: "", body: "" }));
    const sizeOf = async () =>
      new Map([
        ["https://site.jp/strip.jpg", { width: 1900, height: 300 }],
        ["https://site.jp/kv.jpg", { width: 1200, height: 630 }],
      ]);
    expect(await findArticleImage("https://site.jp/news/1", { fetcher, sizeOf })).toBe("https://site.jp/kv.jpg");
    expect(await findArticleImage("https://site.jp/private/2", { fetcher, sizeOf })).toBeNull();
    expect(fetcher).not.toHaveBeenCalledWith("https://site.jp/private/2");
    expect(await findArticleImage("http://192.168.0.5/news", { fetcher, sizeOf })).toBeNull();
  });

  it("sem imagem da matéria: o banner só se não for faixa, senão a capa", () => {
    const anime = { bannerImage: "https://s4.anilist.co/banner.jpg", coverImage: "https://s4.anilist.co/cover.jpg" };
    const wide = new Map([["https://s4.anilist.co/banner.jpg", { width: 1900, height: 400 }]]);
    const ok = new Map([["https://s4.anilist.co/banner.jpg", { width: 1280, height: 720 }]]);
    expect(pickNewsImage("https://site.jp/kv.jpg", anime, wide)).toBe("https://site.jp/kv.jpg");
    expect(pickNewsImage(null, anime, wide)).toBe("https://s4.anilist.co/cover.jpg");
    expect(pickNewsImage(null, anime, ok)).toBe("https://s4.anilist.co/banner.jpg");
    expect(pickNewsImage(null, { bannerImage: "https://s4.anilist.co/banner.jpg", coverImage: null }, wide)).toBe("https://s4.anilist.co/banner.jpg");
    expect(pickNewsImage(null, { bannerImage: null, coverImage: null }, wide)).toBeNull();
  });
});
