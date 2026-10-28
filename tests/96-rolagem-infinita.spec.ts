import { test, expect, type Page } from "@playwright/test";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Rolagem infinita (Epic 43): as listas grandes chegam aos poucos conforme a pessoa desce, em vez de tudo de uma vez.
// Explorar (servidor), temporada, Minha Lista, aba Animes do perfil e busca de perfis.
const GENRE = "Round96Lista";
const TOTAL = 130;
const BASE_ID = 996000;
const pad = (n: number) => String(n).padStart(3, "0");

/** Rola até o fim da página e espera a próxima leva aparecer. */
async function scrollToEnd(page: Page) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
}

/**
 * Rola até chegarem `count` cartões. Os primeiros já vêm prontos do servidor: uma rolagem feita antes de a página
 * terminar de montar (ou antes de ela crescer) pode deixar o fim fora do alcance — como uma pessoa, rola de novo.
 */
async function scrollUntil(page: Page, cards: import("@playwright/test").Locator, count: number) {
  await expect(async () => {
    await scrollToEnd(page);
    await expect(cards).toHaveCount(count, { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

test.describe.serial("Rolagem infinita", () => {
  let prisma: PrismaClient;
  let userId: string;

  async function clean() {
    await prisma.anime.deleteMany({ where: { titleRomaji: { startsWith: "Lista96 " } } });
    await deleteCatalogEntries(prisma, { where: { OR: [{ anilistId: { gte: BASE_ID, lt: BASE_ID + 1000 } }, { titleRomaji: { startsWith: "Bishoujyo Round96" } }] } });
    await prisma.user.deleteMany({ where: { email: { startsWith: "round96-user-" } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();

    await prisma.catalogEntry.createMany({
      data: Array.from({ length: TOTAL }, (_, i) => ({
        anilistId: BASE_ID + i + 1,
        titleRomaji: `Inf96 ${pad(i + 1)}`,
        source: "anilist",
        onPlatform: true,
        genres: GENRE,
        kind: "EPISODE",
        format: "TV",
        season: "FALL",
        seasonYear: 2031,
        startDate: new Date(Date.UTC(2031, 9, 1)),
        popularityRank: i + 1,
        episodes: 1000 - i,
        status: "FINISHED",
        description: "Sinopse longa que a lista não precisa carregar.",
      })),
    });
    // Exatidão do gênero ("Round96A" não é "Round96A-ai") e outra grafia do mesmo nome.
    await prisma.catalogEntry.createMany({
      data: [
        { anilistId: BASE_ID + 500, titleRomaji: "Exato96 A", source: "anilist", onPlatform: true, genres: "Round96A" },
        { anilistId: BASE_ID + 501, titleRomaji: "Exato96 B", source: "anilist", onPlatform: true, genres: "Round96A-ai" },
        { anilistId: BASE_ID + 502, titleRomaji: "Bishoujyo Round96 Teste", source: "anilist", onPlatform: true, genres: "Comedy" },
      ],
    });

    await prisma.anime.createMany({ data: Array.from({ length: 70 }, (_, i) => ({ userId, anilistId: BASE_ID + 700 + i, titleRomaji: `Lista96 ${pad(i + 1)}`, genres: "" })) });
    await prisma.user.createMany({
      data: Array.from({ length: 45 }, (_, i) => ({ email: `round96-user-${pad(i + 1)}@test.local`, passwordHash: "x", passwordSalt: "x", displayName: `Round96User ${pad(i + 1)}` })),
    });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test.describe("API do catálogo", () => {
    test("devolve uma página por vez, com o total e a posição da próxima", async ({ request }) => {
      const first = await (await request.get(`/api/catalog/page?genre=${GENRE}&limit=10`)).json();
      expect(first.total).toBe(TOTAL);
      expect(first.items).toHaveLength(10);
      expect(first.nextCursor).toBe("10");
      expect(first.items[0].titleRomaji).toBe("Inf96 001"); // popular: posição 1 primeiro
      expect(first.items[0].description).toBeNull(); // a lista não carrega a sinopse

      const last = await (await request.get(`/api/catalog/page?genre=${GENRE}&limit=10&cursor=125`)).json();
      expect(last.items).toHaveLength(5);
      expect(last.nextCursor).toBeNull();

      const second = await (await request.get(`/api/catalog/page?genre=${GENRE}&limit=10&cursor=10`)).json();
      expect(second.items[0].titleRomaji).toBe("Inf96 011");
      expect(second.items.map((i: { key: string }) => i.key).filter((k: string) => first.items.some((f: { key: string }) => f.key === k))).toEqual([]); // sem repetir
    });

    test("ordena e filtra no servidor", async ({ request }) => {
      const byEpisodes = await (await request.get(`/api/catalog/page?genre=${GENRE}&sort=episodes&limit=3`)).json();
      expect(byEpisodes.items.map((i: { titleRomaji: string }) => i.titleRomaji)).toEqual(["Inf96 001", "Inf96 002", "Inf96 003"]);
      const byTitle = await (await request.get(`/api/catalog/page?genre=${GENRE}&sort=title&limit=2&cursor=128`)).json();
      expect(byTitle.items.map((i: { titleRomaji: string }) => i.titleRomaji)).toEqual(["Inf96 129", "Inf96 130"]);
      expect((await (await request.get(`/api/catalog/page?genre=${GENRE}&year=2031&kind=EPISODE&season=FALL&status=FINISHED&availability=unscheduled&limit=1`)).json()).total).toBe(TOTAL);
      expect((await (await request.get(`/api/catalog/page?genre=${GENRE}&year=2030&limit=1`)).json()).total).toBe(0);
      expect((await (await request.get(`/api/catalog/page?genre=${GENRE}&availability=scheduled&limit=1`)).json()).total).toBe(0);
    });

    test("o gênero casa inteiro e a busca acha outra grafia do nome", async ({ request }) => {
      const exact = await (await request.get("/api/catalog/page?genre=Round96A")).json();
      expect(exact.items.map((i: { titleRomaji: string }) => i.titleRomaji)).toEqual(["Exato96 A"]);
      const loose = await (await request.get("/api/catalog/page?q=Bishoujo%20Round96")).json();
      expect(loose.items.map((i: { titleRomaji: string }) => i.titleRomaji)).toContain("Bishoujyo Round96 Teste");
      const partial = await (await request.get("/api/catalog/page?q=inf96%2001")).json();
      expect(partial.total).toBe(10); // 010 a 019
    });

    test("parâmetros estranhos não derrubam a consulta", async ({ request }) => {
      const res = await request.get(`/api/catalog/page?genre=${GENRE}&limit=abc&cursor=-3&sort=xx&year=abc&availability=y`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.items).toHaveLength(48);
      expect(body.nextCursor).toBe("48");
    });

    test("as facetas trazem só o que existe no catálogo", async ({ request }) => {
      const facets = await (await request.get("/api/catalog/facets")).json();
      expect(facets.genres.find((g: { name: string }) => g.name === GENRE)).toMatchObject({ count: TOTAL });
      expect(facets.years).toContain(2031);
      expect(facets.kinds).toContain("EPISODE");
      expect(facets.seasons).toContain("FALL");
      expect(facets.statuses).toContain("FINISHED");
    });
  });

  test("Explorar: 48 de cada vez, sem baixar o catálogo inteiro, e avisa quando acabou", async ({ page }) => {
    const requested: string[] = [];
    page.on("request", (req) => requested.push(new URL(req.url()).pathname + new URL(req.url()).search));
    await page.goto(`/discover?genre=${GENRE}`);
    const cards = page.locator('[data-testid^="explore-card-anilist-"]');
    await expect(cards).toHaveCount(48);
    await expect(page.getByText(`${TOTAL} resultados`)).toBeVisible();
    await expect(page.getByTestId("catalog-end")).toHaveCount(0);

    await scrollToEnd(page);
    await expect(cards).toHaveCount(96);
    await scrollToEnd(page);
    await expect(cards).toHaveCount(TOTAL);
    await expect(page.getByTestId("catalog-end")).toHaveText("Você viu todos os resultados.");
    await expect(page.getByTestId("catalog-sentinel")).toHaveCount(0);

    // A primeira página do gênero já vem pronta do servidor; o navegador só pede as duas seguintes.
    expect(requested.filter((r) => r.startsWith("/api/catalog/page")).length).toBe(2);
    expect(requested.some((r) => r === "/api/catalog")).toBe(false); // o catálogo inteiro não é mais baixado
  });

  test("Explorar: trocar o filtro recomeça a lista do começo", async ({ page }) => {
    await page.goto(`/discover?genre=${GENRE}`);
    const cards = page.locator('[data-testid^="explore-card-anilist-"]');
    await expect(cards).toHaveCount(48);
    await scrollUntil(page, cards, 96);
    await page.getByLabel("Tipo").selectOption("EPISODE");
    await expect(cards).toHaveCount(48);
    await expect(page.getByText(`${TOTAL} resultados`)).toBeVisible();
  });

  test("Explorar: a busca por título também rola e junta a grafia diferente", async ({ page }) => {
    await page.goto("/discover");
    await page.getByLabel("Encontre um anime").fill("Inf96");
    const cards = page.locator('[data-testid^="explore-card-anilist-"]');
    await expect(page.getByText(`${TOTAL} animes encontrados`)).toBeVisible();
    await expect(cards).toHaveCount(48);
    await scrollToEnd(page);
    await expect(cards).toHaveCount(96);
    await scrollToEnd(page);
    await expect(cards).toHaveCount(TOTAL);
    await expect(page.getByTestId("catalog-end")).toBeVisible();
  });

  test("Temporada: os cartões aparecem aos poucos", async ({ page }) => {
    await page.goto("/temporada/fall2031");
    const cards = page.locator('[data-testid^="explore-card-anilist-"]');
    await expect(cards).toHaveCount(48);
    await scrollToEnd(page);
    await expect(cards).toHaveCount(96);
    await scrollToEnd(page);
    await expect(cards).toHaveCount(TOTAL);
    await expect(page.getByTestId("season-end")).toBeVisible();
  });

  test("Minha Lista: 30 de cada vez", async ({ page }) => {
    await page.goto("/minha-lista");
    await page.getByLabel("Buscar na minha lista").fill("Lista96");
    const cards = page.locator('[data-testid^="anime-card-"]');
    await expect(cards).toHaveCount(30);
    await scrollToEnd(page);
    await expect(cards).toHaveCount(60);
    await scrollToEnd(page);
    await expect(cards).toHaveCount(70);
    await expect(page.getByTestId("mylist-sentinel")).toHaveCount(0);
  });

  test.describe("aba Animes do perfil", () => {
    test("a API pagina e devolve o total da lista inteira", async ({ request }) => {
      const first = await (await request.get(`/api/users/${userId}/animes?q=Lista96&limit=20`)).json();
      expect(first).toMatchObject({ matched: 70 });
      expect(first.entries).toHaveLength(20);
      expect(first.nextCursor).toBe("20");
      expect(first.total).toBeGreaterThanOrEqual(70);
      const last = await (await request.get(`/api/users/${userId}/animes?q=Lista96&limit=20&cursor=60`)).json();
      expect(last.entries).toHaveLength(10);
      expect(last.nextCursor).toBeNull();
    });

    test("a tela mostra 48 e carrega o resto ao descer", async ({ page }) => {
      await page.goto(`/users/${userId}`);
      await page.getByTestId("tab-animes").click();
      const list = page.getByTestId("profile-anime-list");
      await list.getByLabel("Buscar animes").fill("Lista96");
      const tiles = list.locator('li[data-testid^="profile-anime-996"]');
      await expect(list.getByTestId("profile-anime-count")).toContainText("70 de");
      await expect(tiles).toHaveCount(48);
      await scrollToEnd(page);
      await expect(tiles).toHaveCount(70);
    });
  });

  test.describe("busca de perfis", () => {
    test("a API de perfis e hashtags pagina com cursor", async ({ request }) => {
      const first = await (await request.get("/api/search?q=Round96User&scope=profiles&limit=20")).json();
      expect(first.profiles).toHaveLength(20);
      expect(first.nextCursor).toBe("20");
      const third = await (await request.get("/api/search?q=Round96User&scope=profiles&limit=20&cursor=40")).json();
      expect(third.profiles).toHaveLength(5);
      expect(third.nextCursor).toBeNull();
    });

    test("a tela de perfis mostra 20 e carrega o resto ao descer", async ({ page }) => {
      await page.goto("/buscar?q=Round96User&scope=profiles");
      const rows = page.getByTestId("search-results").locator("> *");
      await expect(rows).toHaveCount(20);
      await scrollToEnd(page);
      await expect(rows).toHaveCount(40);
      await scrollToEnd(page);
      await expect(rows).toHaveCount(45);
    });
  });
});
