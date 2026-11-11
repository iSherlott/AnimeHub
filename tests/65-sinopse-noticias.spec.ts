import { createServer, type Server } from "node:http";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Sinopse traduzida (pt/ja segundo a preferência) e Notícias da temporada (serviço news-fetcher → Jikan).
// MyMemory e Jikan são simulados por um servidor local (MYMEMORY_URL / JIKAN_API_BASE_URL em global-setup).
const FAKE_PORT = 3198;
const HUB_EMAIL_CLEANUP = "newshub@system.invalid";
const SYNOPSIS_ID = 965010;
const NEWS_A = { anilistId: 965021, malId: 96521, title: "Noticia Alfa Round65" };
const NEWS_B = { anilistId: 965022, malId: 96522, title: "Noticia Beta Round65" };
const OFFICIAL_SITE = `http://localhost:${FAKE_PORT}/site/`;
// 11/11: a matéria do site oficial é aberta para achar a imagem dela; o tamanho já fica "medido" (sem rede no teste).
const ARTICLE_IMAGE = "https://img.round65.test/kv-round65.jpg";
const BANNER_A = "https://s4.anilist.co/file/anilistcdn/media/anime/banner-a.jpg";
const BANNER_B = "https://s4.anilist.co/file/anilistcdn/media/anime/banner-b.jpg";
const COVER_A = "https://s4.anilist.co/file/anilistcdn/media/anime/cover-a-round65.jpg";

function currentSeasonNow(): { season: string; seasonYear: number } {
  const now = new Date();
  const month = now.getMonth() + 1;
  const season = month <= 3 ? "WINTER" : month <= 6 ? "SPRING" : month <= 9 ? "SUMMER" : "FALL";
  return { season, seasonYear: now.getFullYear() };
}

const adminState = {
  cookies: [
    { name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const },
  ],
  origins: [],
};

let fake: Server;
let prisma: PrismaClient;

test.beforeAll(async () => {
  prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
  for (const [url, width, height] of [[BANNER_A, 1900, 400], [BANNER_B, 1900, 400], [COVER_A, 460, 650], [ARTICLE_IMAGE, 1200, 630]] as const) {
    await prisma.imageSize.upsert({ where: { url }, create: { url, width, height }, update: { width, height, measuredAt: new Date() } });
  }
  fake = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://localhost:${FAKE_PORT}`);
    res.setHeader("Content-Type", "application/json");
    if (url.pathname === "/mymemory") {
      const lang = (url.searchParams.get("langpair") ?? "").split("|")[1]?.toUpperCase();
      res.end(JSON.stringify({ responseStatus: 200, responseData: { translatedText: `[${lang}] ${url.searchParams.get("q")}` } }));
      return;
    }
    if (url.pathname === "/feed.xml") {
      res.setHeader("Content-Type", "application/rss+xml");
      res.end(`<?xml version="1.0"?><rss version="2.0"><channel><title>ANN</title>
        <item><title>${NEWS_A.title} gets a trailer</title><link>https://www.animenewsnetwork.com/news/round65/.1</link><description>Teaser out now</description><pubDate>${new Date(Date.now() - 1800_000).toUTCString()}</pubDate></item>
        <item><title>Algo sem relação nenhuma</title><link>https://www.animenewsnetwork.com/news/round65/.2</link><pubDate>${new Date().toUTCString()}</pubDate></item>
      </channel></rss>`);
      return;
    }
    // Site oficial da obra Alfa (estrutura de lista dos sites japoneses: data + link da matéria em cada item).
    if (url.pathname === "/site/") {
      res.setHeader("Content-Type", "text/html");
      res.end(`<html><body><a href="news/">NEWS</a><a href="story/">STORY</a></body></html>`);
      return;
    }
    if (url.pathname === "/site/news/" && url.searchParams.get("article_id") === "6501") {
      res.setHeader("Content-Type", "text/html");
      res.end(`<html><head><meta property="og:image" content="${ARTICLE_IMAGE}"><link rel="icon" href="/favicon.ico"></head><body>第2期キービジュアル公開！</body></html>`);
      return;
    }
    if (url.pathname === "/site/news/") {
      const day = (d: Date) => `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, "0")}.${String(d.getUTCDate()).padStart(2, "0")}`;
      res.setHeader("Content-Type", "text/html");
      res.end(`<ul class="news-list">
        <li><a href="./?article_id=6501"><span class="date">${day(new Date(Date.now() - 86400_000))}</span><span class="title">第2期キービジュアル公開！</span></a></li>
        <li><a href="./?category_id=1">INFO</a></li>
      </ul>`);
      return;
    }
    const news = /^\/v4\/anime\/(\d+)\/news$/.exec(url.pathname);
    if (news) {
      const mal = Number(news[1]);
      const base = Date.now();
      const items =
        mal === NEWS_A.malId
          ? [
              { url: `https://myanimelist.net/news/${mal}1`, title: "Alfa second season confirmed", date: new Date(base - 3600_000).toISOString(), author_username: "reporter", excerpt: "Staff and cast announced.", images: { jpg: { image_url: "https://cdn.myanimelist.net/images/a.jpg" } } },
              { url: `https://myanimelist.net/news/${mal}2`, title: "Alfa new visual", date: new Date(base - 2 * 86400_000).toISOString() },
            ]
          : mal === NEWS_B.malId
            ? [{ url: `https://myanimelist.net/news/${mal}1`, title: "Beta opening theme revealed", date: new Date(base - 7200_000).toISOString() }]
            : [];
      res.end(JSON.stringify({ data: items }));
      return;
    }
    res.statusCode = 404;
    res.end("{}");
  });
  await new Promise<void>((resolve) => fake.listen(FAKE_PORT, resolve));

  const { season, seasonYear } = currentSeasonNow();
  const franchise = await prisma.franchise.upsert({ where: { rootAnilistId: SYNOPSIS_ID }, create: { rootAnilistId: SYNOPSIS_ID, name: "Sinopse Round65" }, update: {} });
  await prisma.production.upsert({
    where: { anilistId: SYNOPSIS_ID },
    create: { anilistId: SYNOPSIS_ID, franchiseId: franchise.id, titleRomaji: "Sinopse Round65 Heroi", description: "A lone hero rises.", season, seasonYear, streamingLinksJson: "[]", fetchedAt: new Date() },
    update: {},
  });
  for (const n of [NEWS_A, NEWS_B]) {
    await prisma.catalogEntry.upsert({
      where: { anilistId: n.anilistId },
      create: { anilistId: n.anilistId, malId: n.malId, titleRomaji: n.title, season, seasonYear, source: "anilist", bannerImage: `https://s4.anilist.co/file/anilistcdn/media/anime/banner-${n.malId === 96521 ? "a" : "b"}.jpg`, coverImage: n === NEWS_A ? COVER_A : null, officialSite: n === NEWS_A ? OFFICIAL_SITE : null },
      update: { malId: n.malId, season, seasonYear, bannerImage: `https://s4.anilist.co/file/anilistcdn/media/anime/banner-${n.malId === 96521 ? "a" : "b"}.jpg`, coverImage: n === NEWS_A ? COVER_A : null, officialSite: n === NEWS_A ? OFFICIAL_SITE : null },
    });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
  await prisma.anime.upsert({
    where: { userId_anilistId: { userId: user.id, anilistId: NEWS_A.anilistId } },
    create: { userId: user.id, anilistId: NEWS_A.anilistId, titleRomaji: NEWS_A.title, genres: "" },
    update: {},
  });
});

test.afterAll(async () => {
  await prisma.synopsisTranslation.deleteMany({ where: { anilistId: SYNOPSIS_ID } });
  await prisma.post.deleteMany({ where: { user: { email: HUB_EMAIL_CLEANUP } } });
  await prisma.user.deleteMany({ where: { email: HUB_EMAIL_CLEANUP } });
  await prisma.animeNews.deleteMany({ where: { anilistId: { in: [NEWS_A.anilistId, NEWS_B.anilistId] } } });
  await prisma.anime.deleteMany({ where: { anilistId: NEWS_A.anilistId } });
  await deleteCatalogEntries(prisma, { where: { anilistId: { in: [NEWS_A.anilistId, NEWS_B.anilistId] } } });
  await prisma.production.deleteMany({ where: { anilistId: SYNOPSIS_ID } });
  await prisma.franchise.deleteMany({ where: { rootAnilistId: SYNOPSIS_ID } });
  await prisma.$disconnect();
  await new Promise<void>((resolve) => fake.close(() => resolve()));
});

test.describe.serial("Sinopse no idioma da preferência", () => {
  test("com títulos em japonês e sem escolha no perfil, a sinopse vem em português (e fica guardada)", async ({ page }) => {
    await page.goto(`/obra/${SYNOPSIS_ID}`);
    await expect(page.getByTestId("synopsis")).toContainText("[PT] A lone hero rises.", { timeout: 15_000 });
    const saved = await prisma.synopsisTranslation.findUniqueOrThrow({ where: { anilistId_lang: { anilistId: SYNOPSIS_ID, lang: "pt" } } });
    expect(saved.text).toBe("[PT] A lone hero rises.");
  });

  test("títulos em inglês: a sinopse segue o idioma original", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("anime-hub:title-preference", JSON.stringify({ language: "en", japaneseScript: "kanji" })));
    await page.goto(`/obra/${SYNOPSIS_ID}`);
    await expect(page.getByTestId("synopsis")).toHaveText("A lone hero rises.");
  });

  test("Configurações: escolher 日本語 grava no perfil e a sinopse passa a vir em japonês", async ({ page }) => {
    await page.goto("/configuracoes");
    await page.getByRole("radio", { name: "日本語 (japonês)" }).check({ force: true });
    await page.getByRole("button", { name: /Salvar/ }).click();
    await expect(page.getByText(/salv/i).first()).toBeVisible();
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    expect(user.synopsisLanguage).toBe("ja");

    await page.goto(`/obra/${SYNOPSIS_ID}`);
    await expect(page.getByTestId("synopsis")).toContainText("[JA] A lone hero rises.", { timeout: 15_000 });
  });

  test.afterAll(async () => {
    await prisma.user.update({ where: { email: TEST_USER_EMAIL }, data: { synopsisLanguage: null } });
  });
});

const HUB_EMAIL = "newshub@system.invalid";

test.describe.serial("Notícias = publicações do NewsHub", () => {
  test("só administradores chamam o serviço de notícias", async ({ request }) => {
    const res = await request.post("/api/admin/news/run");
    expect(res.status()).toBe(403);
  });

  test.describe("pelo painel", () => {
    test.use({ storageState: adminState });

    test("Scrapers mostra o card e 'Buscar notícias' busca e publica no feed", async ({ page }) => {
      await page.goto("/admin/scrapers");
      await expect(page.getByText("Notícias da temporada · Jikan").first()).toBeVisible();
      await page.getByTestId("run-news").click();

      await expect
        .poll(async () => (await prisma.newsRun.findFirst({ orderBy: { startedAt: "desc" } }))?.status ?? "NONE", { timeout: 40_000 })
        .toMatch(/OK|PARTIAL/);
      expect(await prisma.animeNews.count({ where: { anilistId: NEWS_A.anilistId } })).toBe(4); // 2 da Jikan + 1 do feed + 1 do site oficial
      expect(await prisma.animeNews.findFirstOrThrow({ where: { anilistId: NEWS_A.anilistId, url: { contains: "round65" } } })).toMatchObject({ source: "Anime News Network" });

      // Cada notícia virou UMA publicação do NewsHub, com imagem e a # de um anime.
      const hub = await prisma.user.findUniqueOrThrow({ where: { email: HUB_EMAIL } });
      expect(hub).toMatchObject({ handle: "newshub", displayName: "NewsHub" });
      const posts = await prisma.post.findMany({ where: { userId: hub.id, anilistId: { in: [NEWS_A.anilistId, NEWS_B.anilistId] } }, include: { hashtags: { include: { hashtag: true } } } });
      expect(posts).toHaveLength(5);
      for (const post of posts) {
        expect(post.imageUrls).toHaveLength(1); // toda notícia tem imagem
        expect(post.hashtags).toHaveLength(1);
        expect(post.hashtags[0].hashtag.anilistId).toBe(post.anilistId); // a # está vinculada ao anime
        expect(post.hashtags[0].hashtag.kind).toBe("WORK");
      }
      const trailer = posts.find((p) => p.body.includes("gets a trailer"))!;
      expect(trailer.body).toContain("Fonte: Anime News Network — https://www.animenewsnetwork.com/news/round65/.1");
      expect(trailer.body).toContain("#noticiaalfaround65");
      expect(trailer.body.length).toBeLessThanOrEqual(500);
      // Sem imagem na matéria (feed do ANN), usa a imagem da obra que serve para o Feed: o banner 1900×400 é uma faixa
      // larga demais, então vai a capa. Sem capa (Beta), fica o banner mesmo. Com imagem (Jikan), usa a da matéria.
      expect(trailer.imageUrls[0]).toBe(COVER_A);
      const withImage = posts.find((p) => p.body.includes("Alfa second season confirmed"))!;
      expect(withImage.imageUrls[0]).toBe("https://cdn.myanimelist.net/images/a.jpg");
      // Do site oficial: o item da lista (a categoria não é matéria), com a fonte e o link da matéria.
      const official = posts.find((p) => p.body.includes("第2期キービジュアル公開！"))!;
      expect(official.body).toContain(`Fonte: Site oficial — ${OFFICIAL_SITE}news/?article_id=6501`);
      expect(official.body).toContain("#noticiaalfaround65");
      expect(await prisma.animeNews.count({ where: { url: { contains: "category_id" } } })).toBe(0);
      // 11/11: a imagem da matéria do site oficial (og:image) foi achada e conferida; o ícone não conta.
      expect(official.imageUrls[0]).toBe(ARTICLE_IMAGE);
      expect((await prisma.animeNews.findFirstOrThrow({ where: { url: { contains: "article_id=6501" } } })).imageCheckedAt).not.toBeNull();
      // 11/11: a notícia em japonês ganhou português e inglês; a do ANN (inglês), português e japonês.
      const translationsOf = async (postId: string) => Object.fromEntries((await prisma.postTranslation.findMany({ where: { postId } })).map((t) => [t.lang, t.body]));
      expect(official.bodyLang).toBe("ja");
      const officialT = await translationsOf(official.id);
      expect(officialT.pt).toContain("[PT] 第2期キービジュアル公開！");
      expect(officialT.pt).toContain(`Fonte: Site oficial — ${OFFICIAL_SITE}news/?article_id=6501`);
      expect(officialT.pt).toContain("#noticiaalfaround65");
      expect(officialT.en).toContain("[EN] 第2期キービジュアル公開！");
      expect(trailer.bodyLang).toBe("en");
      expect(Object.keys(await translationsOf(trailer.id)).sort()).toEqual(["ja", "pt"]);
      // A publicação nasce com a hora da notícia (ordem cronológica de verdade).
      expect(Date.now() - trailer.createdAt.getTime()).toBeGreaterThan(20 * 60_000);
    });

    test("rodar de novo não duplica publicações", async ({ request }) => {
      const hub = await prisma.user.findUniqueOrThrow({ where: { email: HUB_EMAIL } });
      const before = await prisma.post.count({ where: { userId: hub.id } });
      expect((await request.post("/api/admin/news/run")).status()).toBe(202);
      await expect
        .poll(async () => (await prisma.newsRun.findFirst({ orderBy: { startedAt: "desc" } }))?.status ?? "NONE", { timeout: 40_000 })
        .toMatch(/OK|PARTIAL/);
      await new Promise((r) => setTimeout(r, 500));
      expect(await prisma.post.count({ where: { userId: hub.id } })).toBe(before);
    });
  });

  test("a conta NewsHub não aceita login", async ({ request }) => {
    const res = await request.post("/api/auth/login", { data: { email: HUB_EMAIL, password: "qualquer-coisa-12345" } });
    expect(res.status()).toBe(401);
  });

  test("a Comunidade não tem seção separada de Notícias — elas são publicações do feed", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "Notícias", exact: true })).toHaveCount(0);
    expect((await page.request.get("/noticias")).status()).toBe(404);
  });

  test("a notícia aparece no feed com imagem, NewsHub, # da obra e fonte clicável", async ({ page, request }) => {
    const feed = await (await request.get(`/api/posts?tab=recent&anilistId=${NEWS_A.anilistId}&limit=10`)).json();
    expect(feed.posts.map((p: { body: string }) => p.body.split("\n")[0]).sort()).toEqual(["Alfa new visual", "Alfa second season confirmed", `${NEWS_A.title} gets a trailer`, "第2期キービジュアル公開！"].sort());
    expect(feed.posts.every((p: { author: { handle: string } }) => p.author.handle === "newshub")).toBe(true);
    expect(feed.posts.every((p: { imageUrls: string[] }) => p.imageUrls.length === 1)).toBe(true);

    // As imagens das fixtures são URLs de mentira: serve um PNG de 1x1 para o <img> não cair no onError.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
    await page.route(/s4\.anilist\.co|cdn\.myanimelist\.net/, (route) => route.fulfill({ status: 200, contentType: "image/png", body: png }));
    await page.goto("/hashtag/noticiaalfaround65");
    const card = page.locator('[data-testid^="post-card-"]', { hasText: "gets a trailer" });
    await expect(card).toContainText("NewsHub");
    await expect(card).toContainText("@newshub");
    await expect(card.locator("img").first()).toBeVisible();
    await expect(card.getByTestId("hashtag-link")).toHaveText("#noticiaalfaround65");
    const source = card.getByTestId("post-link");
    await expect(source).toHaveAttribute("href", "https://www.animenewsnetwork.com/news/round65/.1");
    await expect(source).toHaveAttribute("target", "_blank");
    await expect(card.getByRole("button", { name: /curtir/i }).first()).toBeVisible();
  });

  test("a # da notícia leva à página da hashtag com a obra vinculada (também sem produção)", async ({ page }) => {
    await page.goto("/hashtag/noticiaalfaround65");
    await expect(page.getByText("Alfa second season confirmed")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Obra em contexto" })).toBeVisible();
    await expect(page.getByText(NEWS_A.title).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Abrir detalhe do anime/ })).toHaveAttribute("href", `/anime/${NEWS_A.anilistId}`);
  });

  test("o perfil NewsHub existe e lista as notícias", async ({ page }) => {
    const hub = await prisma.user.findUniqueOrThrow({ where: { email: HUB_EMAIL } });
    await page.goto(`/users/${hub.id}`);
    await expect(page.getByText("NewsHub").first()).toBeVisible();
    await expect(page.getByText("@newshub").first()).toBeVisible();
    await expect(page.getByText("Beta opening theme revealed")).toBeVisible();
  });

  test("feed infinito: ao descer, a próxima página chega sozinha, sem botão", async ({ page }) => {
    const hub = await prisma.user.findUniqueOrThrow({ where: { email: HUB_EMAIL } });
    await prisma.post.createMany({
      data: Array.from({ length: 45 }, (_, i) => ({
        userId: hub.id,
        anilistId: NEWS_B.anilistId,
        animeTitleRomaji: NEWS_B.title,
        body: `Notícia de volume ${i} #noticiabetaround65`,
        createdAt: new Date(Date.now() + 3600_000 - i * 1000), // as mais novas do banco: abrem a 1ª página
      })),
    });
    try {
      await page.goto("/");
      await page.getByRole("tab", { name: "Recentes" }).click();
      const cards = page.locator('[data-testid^="post-card-"]', { hasText: "Notícia de volume" });
      await expect(cards).toHaveCount(20);
      await expect(page.getByRole("button", { name: "Ver mais conversas" })).toHaveCount(0);
      await expect
        .poll(
          async () => {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            return cards.count();
          },
          { timeout: 30_000 }
        )
        .toBe(45);
    } finally {
      await prisma.post.deleteMany({ where: { userId: hub.id, body: { contains: "Notícia de volume" } } });
    }
  });
});

