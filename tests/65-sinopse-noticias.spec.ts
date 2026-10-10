import { createServer, type Server } from "node:http";
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
      create: { anilistId: n.anilistId, malId: n.malId, titleRomaji: n.title, season, seasonYear, source: "anilist" },
      update: { malId: n.malId, season, seasonYear },
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
  await prisma.catalogEntry.deleteMany({ where: { anilistId: { in: [NEWS_A.anilistId, NEWS_B.anilistId] } } });
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
      expect(await prisma.animeNews.count({ where: { anilistId: NEWS_A.anilistId } })).toBe(3); // 2 da Jikan + 1 do feed
      expect(await prisma.animeNews.findFirstOrThrow({ where: { anilistId: NEWS_A.anilistId, url: { contains: "round65" } } })).toMatchObject({ source: "Anime News Network" });

      // Cada notícia virou UMA publicação do NewsHub, com a # da obra.
      const hub = await prisma.user.findUniqueOrThrow({ where: { email: HUB_EMAIL } });
      expect(hub).toMatchObject({ handle: "newshub", displayName: "NewsHub" });
      expect(await prisma.post.count({ where: { userId: hub.id, anilistId: { in: [NEWS_A.anilistId, NEWS_B.anilistId] } } })).toBe(4);
      const post = await prisma.post.findFirstOrThrow({ where: { userId: hub.id, body: { contains: "gets a trailer" } }, include: { hashtags: { include: { hashtag: true } } } });
      expect(post.anilistId).toBe(NEWS_A.anilistId);
      expect(post.body).toContain("Fonte: Anime News Network — https://www.animenewsnetwork.com/news/round65/.1");
      expect(post.body).toContain("#noticiaalfaround65");
      expect(post.body.length).toBeLessThanOrEqual(500);
      expect(post.hashtags.map((h) => h.hashtag.key)).toEqual(["noticiaalfaround65"]);
      // A publicação nasce com a hora da notícia (ordem cronológica de verdade).
      expect(Date.now() - post.createdAt.getTime()).toBeGreaterThan(20 * 60_000);
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

  test("Comunidade → Notícias mostra publicações no formato do feed: NewsHub, # da obra e fonte", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("community-section-news").click();
    await expect(page).toHaveURL(/\/noticias$/);
    const cards = page.locator('[data-testid^="post-card-"]');
    await expect(cards).toHaveCount(4);
    const first = cards.first();
    await expect(first).toContainText("gets a trailer");
    await expect(first).toContainText("NewsHub");
    await expect(first).toContainText("@newshub");
    await expect(first.getByTestId("hashtag-link")).toHaveText("#noticiaalfaround65");
    await expect(first.getByTestId("hashtag-link")).toHaveAttribute("href", "/hashtag/noticiaalfaround65");
    const source = first.getByTestId("post-link");
    await expect(source).toHaveAttribute("href", "https://www.animenewsnetwork.com/news/round65/.1");
    await expect(source).toHaveAttribute("target", "_blank");
    // Mesma ação de qualquer publicação.
    await expect(first.getByRole("button", { name: /curtir/i }).first()).toBeVisible();
  });

  test("as notícias são publicações comuns: entram no feed da obra, na página da # e na API do feed", async ({ page, request }) => {
    const feed = await (await request.get(`/api/posts?tab=recent&anilistId=${NEWS_A.anilistId}&limit=10`)).json();
    expect(feed.posts.map((p: { body: string }) => p.body.split("\n")[0]).sort()).toEqual(["Alfa new visual", "Alfa second season confirmed", `${NEWS_A.title} gets a trailer`].sort());
    expect(feed.posts.every((p: { author: { handle: string } }) => p.author.handle === "newshub")).toBe(true);

    await page.goto("/hashtag/noticiaalfaround65");
    await expect(page.getByText("Alfa second season confirmed")).toBeVisible();
  });

  test("o perfil NewsHub existe e lista as notícias", async ({ page }) => {
    const hub = await prisma.user.findUniqueOrThrow({ where: { email: HUB_EMAIL } });
    await page.goto(`/users/${hub.id}`);
    await expect(page.getByText("NewsHub").first()).toBeVisible();
    await expect(page.getByText("@newshub").first()).toBeVisible();
    await expect(page.getByText("Beta opening theme revealed")).toBeVisible();
  });

  test("'Que sigo' mostra só as obras da Minha Lista", async ({ page }) => {
    await page.goto("/noticias");
    await page.getByTestId("news-tab-following").click();
    await expect(page.locator('[data-testid^="post-card-"]')).toHaveCount(3);
    await expect(page.getByText("Beta opening theme revealed")).toHaveCount(0);
  });

  test("a busca filtra por obra, assunto ou #hashtag e o vazio é explicado", async ({ page }) => {
    await page.goto("/noticias");
    const box = page.getByRole("textbox", { name: "Busca nas notícias" });
    await box.fill("Beta");
    await page.getByRole("button", { name: "Buscar notícias" }).click();
    await expect(page.locator('[data-testid^="post-card-"]')).toHaveCount(1);
    await expect(page.getByText("Beta opening theme revealed")).toBeVisible();

    await box.fill("#noticiaalfaround65");
    await page.getByRole("button", { name: "Buscar notícias" }).click();
    await expect(page.locator('[data-testid^="post-card-"]')).toHaveCount(3);

    await box.fill("nada disso existe");
    await page.getByRole("button", { name: "Buscar notícias" }).click();
    await expect(page.getByTestId("news-empty")).toContainText("Nenhuma notícia encontrada.");
  });

  test("rolagem infinita: ao descer, a próxima página chega sozinha, sem botão", async ({ page }) => {
    const hub = await prisma.user.findUniqueOrThrow({ where: { email: HUB_EMAIL } });
    const base = Date.now() - 10 * 86400_000;
    await prisma.post.createMany({
      data: Array.from({ length: 45 }, (_, i) => ({
        userId: hub.id,
        anilistId: NEWS_B.anilistId,
        animeTitleRomaji: NEWS_B.title,
        body: `Notícia de volume ${i} #noticiabetaround65`,
        createdAt: new Date(base - i * 60_000),
      })),
    });
    try {
      await page.goto("/noticias");
      const cards = page.locator('[data-testid^="post-card-"]');
      await expect(cards).toHaveCount(20);
      await expect(page.getByRole("button", { name: "Ver mais notícias" })).toHaveCount(0);
      // Rola até o fim repetidamente: cada página nova empurra o sentinela para baixo.
      await expect
        .poll(
          async () => {
            await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
            return cards.count();
          },
          { timeout: 30_000 }
        )
        .toBe(49);
      await expect(page.getByTestId("news-end")).toBeVisible();
    } finally {
      await prisma.post.deleteMany({ where: { userId: hub.id, body: { contains: "Notícia de volume" } } });
    }
  });

  test("Comunidade: o feed também rola sem fim (sem botão 'Ver mais conversas')", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Recentes" }).click();
    await expect(page.getByRole("button", { name: "Ver mais conversas" })).toHaveCount(0);
  });

  test.describe("sem conta", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("'Todas' é pública; 'Que sigo' pede para entrar", async ({ page, request }) => {
      expect((await request.get("/api/posts/news?scope=following")).status()).toBe(401);
      expect((await request.get("/api/posts/news")).status()).toBe(200);
      await page.goto("/noticias");
      await expect(page.locator('[data-testid^="post-card-"]')).toHaveCount(4);
      await page.getByTestId("news-tab-following").click();
      await expect(page.getByTestId("news-login")).toContainText("Entre para ver as notícias");
    });
  });
});
