import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Sinopse traduzida (pt/ja segundo a preferência) e Notícias da temporada (serviço news-fetcher → Jikan).
// MyMemory e Jikan são simulados por um servidor local (MYMEMORY_URL / JIKAN_API_BASE_URL em global-setup).
const FAKE_PORT = 3198;
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

test.describe.serial("Notícias da temporada", () => {
  test("só administradores chamam o serviço de notícias", async ({ request }) => {
    const res = await request.post("/api/admin/news/run");
    expect(res.status()).toBe(403);
  });

  test.describe("pelo painel", () => {
    test.use({ storageState: adminState });

    test("Scrapers mostra o card e 'Buscar notícias' busca as obras da temporada", async ({ page }) => {
      await page.goto("/admin/scrapers");
      await expect(page.getByText("Notícias da temporada · Jikan").first()).toBeVisible();
      await page.getByTestId("run-news").click();

      await expect
        .poll(async () => (await prisma.newsRun.findFirst({ orderBy: { startedAt: "desc" } }))?.status ?? "NONE", { timeout: 40_000 })
        .toMatch(/OK|PARTIAL/);
      expect(await prisma.animeNews.count({ where: { anilistId: NEWS_A.anilistId } })).toBe(3); // 2 da Jikan + 1 do feed
      expect(await prisma.animeNews.findFirstOrThrow({ where: { anilistId: NEWS_A.anilistId, url: { contains: "round65" } } })).toMatchObject({ source: "Anime News Network" });
      expect(await prisma.animeNews.count({ where: { anilistId: NEWS_B.anilistId } })).toBe(1);
    });
  });

  test("Comunidade → Notícias lista tudo da temporada, mais novas primeiro", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("community-section-news").click();
    await expect(page).toHaveURL(/\/noticias$/);
    const items = page.getByTestId("news-item");
    await expect(items).toHaveCount(4);
    await expect(items.first()).toContainText("gets a trailer");
    await expect(items.nth(1).getByRole("link", { name: "Alfa second season confirmed" })).toHaveAttribute("href", /myanimelist\.net\/news\//);
    await expect(items.nth(1).getByRole("link", { name: "Alfa second season confirmed" })).toHaveAttribute("target", "_blank");
  });

  test("'Que sigo' mostra só as obras da Minha Lista", async ({ page }) => {
    await page.goto("/noticias");
    await page.getByTestId("news-tab-following").click();
    const items = page.getByTestId("news-item");
    await expect(items).toHaveCount(3);
    await expect(page.getByTestId("news-anime").first()).toContainText(NEWS_A.title, { ignoreCase: true });
  });

  test("a busca filtra por obra ou assunto e o vazio é explicado", async ({ page }) => {
    await page.goto("/noticias");
    await page.getByRole("textbox", { name: "Busca nas notícias" }).fill("Beta");
    await page.getByRole("button", { name: "Buscar notícias" }).click();
    await expect(page.getByTestId("news-item")).toHaveCount(1);
    await expect(page.getByTestId("news-item")).toContainText("Beta opening theme revealed");

    await page.getByRole("textbox", { name: "Busca nas notícias" }).fill("nada disso existe");
    await page.getByRole("button", { name: "Buscar notícias" }).click();
    await expect(page.getByTestId("news-empty")).toContainText("Nenhuma notícia encontrada.");
  });

  test.describe("sem conta", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("'Todas' é pública; 'Que sigo' pede para entrar", async ({ page, request }) => {
      expect((await request.get("/api/news?scope=following")).status()).toBe(401);
      expect((await request.get("/api/news")).status()).toBe(200);
      await page.goto("/noticias");
      await expect(page.getByTestId("news-item")).toHaveCount(4);
      await page.getByTestId("news-tab-following").click();
      await expect(page.getByTestId("news-login")).toContainText("Entre para ver as notícias");
    });
  });
});
