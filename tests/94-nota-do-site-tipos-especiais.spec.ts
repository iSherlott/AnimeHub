import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Epic 42: nota do site (começa em 5 e é regulada pelas notas de quem terminou), "Temporadas" só com episódios e a seção
// "Especiais e filmes" (OVA, ODA, filme) com o aviso junto da sinopse.
const SCORED = 994101;
const FR1 = 994201;
const FR2 = 994202;
const ROOT = 994301;
const OVA = 994302;
const ODA = 994303;
const MOVIE = 994304;
const ALL = [SCORED, FR1, FR2, ROOT, OVA, ODA, MOVIE];

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Nota do site, tipos e especiais", () => {
  let prisma: PrismaClient;
  let userId: string;
  let adminId: string;

  async function clean() {
    await prisma.anime.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: [FR1, ROOT] } } });
    await prisma.catalogEntry.deleteMany({ where: { anilistId: { in: ALL } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    await clean();

    const entry = (anilistId: number, titleRomaji: string, kind: string, format: string, startDate: string, relations: Array<{ id: number; titleRomaji: string; format: string; relationType: string }> = [], extra = {}) =>
      prisma.catalogEntry.create({
        data: { anilistId, titleRomaji, kind, format, season: "FALL", seasonYear: Number(startDate.slice(0, 4)), startDate: new Date(startDate), episodes: kind === "MOVIE" ? 1 : 12, description: `Sinopse ${titleRomaji}.`, genres: "Drama", source: "anilist", onPlatform: true, relationsJson: JSON.stringify(relations), ...extra },
      });

    // Grupo da nota
    await entry(SCORED, "Nota Round94", "EPISODE", "TV", "2025-10-01");

    // Duas temporadas em episódios
    const f1 = await prisma.franchise.create({ data: { rootAnilistId: FR1, name: "Notas Round94" } });
    for (const [anilistId, title, seasonNumber, date] of [[FR1, "Temporadas Round94", 1, "2025-10-01"], [FR2, "Temporadas Round94 Season 2", 2, "2026-10-01"]] as const) {
      await prisma.production.create({ data: { anilistId, franchiseId: f1.id, titleRomaji: title, seasonNumber, status: "FINISHED", season: "FALL", seasonYear: Number(date.slice(0, 4)), format: "TV", episodes: 12, description: `Sinopse ${title}.`, genres: "Drama", streamingLinksJson: "[]", fetchedAt: new Date() } });
      await entry(anilistId, title, "EPISODE", "TV", date);
    }

    // A obra, um OVA, um ODA e um filme: a série é a linha principal e os outros são especiais.
    const f2 = await prisma.franchise.create({ data: { rootAnilistId: ROOT, name: "Especiais Round94" } });
    const rel = (id: number, titleRomaji: string, format: string, relationType: string) => ({ id, titleRomaji, format, relationType });
    await prisma.production.create({ data: { anilistId: ROOT, franchiseId: f2.id, titleRomaji: "Serie Round94", seasonNumber: 1, status: "FINISHED", season: "FALL", seasonYear: 2020, format: "TV", episodes: 12, description: "Sinopse Serie Round94.", genres: "Drama", streamingLinksJson: "[]", fetchedAt: new Date() } });
    await prisma.production.create({ data: { anilistId: OVA, franchiseId: f2.id, titleRomaji: "Serie Round94 OVA", seasonNumber: 2, status: "FINISHED", season: "SPRING", seasonYear: 2021, format: "OVA", episodes: 2, description: "Sinopse OVA.", genres: "Drama", streamingLinksJson: "[]", fetchedAt: new Date() } });
    await entry(ROOT, "Serie Round94", "EPISODE", "TV", "2020-10-01", [rel(OVA, "Serie Round94 OVA", "OVA", "SIDE_STORY"), rel(ODA, "Serie Round94 DVD", "SPECIAL", "SIDE_STORY"), rel(MOVIE, "Serie Round94 Movie", "MOVIE", "SUMMARY")]);
    await entry(OVA, "Serie Round94 OVA", "OVA", "OVA", "2021-04-10", [rel(ROOT, "Serie Round94", "TV", "PARENT")]);
    await entry(ODA, "Serie Round94 DVD", "ODA", "SPECIAL", "2021-06-10", [rel(ROOT, "Serie Round94", "TV", "PARENT")]);
    await entry(MOVIE, "Serie Round94 Movie", "MOVIE", "MOVIE", "2022-03-10", [rel(ROOT, "Serie Round94", "TV", "PARENT")]);
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test.describe("a nota do site (API)", () => {
    let mine: string;
    let adminAnime: string;
    const siteScore = async () => (await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: SCORED } }));

    test.beforeAll(async () => {
      mine = (await prisma.anime.create({ data: { userId, anilistId: SCORED, titleRomaji: "Nota Round94", genres: "" } })).id;
      adminAnime = (await prisma.anime.create({ data: { userId: adminId, anilistId: SCORED, titleRomaji: "Nota Round94", genres: "", watchState: "FINISHED" } })).id;
    });

    test("toda obra começa em 5, sem notas", async () => {
      expect(await siteScore()).toMatchObject({ siteScore: 5, siteScoreVotes: 0 });
    });

    test("exige login, ser dono da obra e uma nota de 0 a 10", async ({ playwright, baseURL, request }) => {
      const guest = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
      expect((await guest.patch(`/api/anime/${mine}/score`, { data: { score: 8 } })).status()).toBe(401);
      await guest.dispose();
      expect((await request.patch(`/api/anime/${adminAnime}/score`, { data: { score: 8 } })).status()).toBe(404); // é da conta do admin
      for (const bad of [{}, { score: "8" }, { score: 11 }, { score: -1 }, { score: 7.5 }]) {
        expect((await request.patch(`/api/anime/${mine}/score`, { data: bad })).status()).toBe(400);
      }
    });

    test("só quem terminou pode avaliar", async ({ request }) => {
      const res = await request.patch(`/api/anime/${mine}/score`, { data: { score: 9 } });
      expect(res.status()).toBe(409);
      expect(await siteScore()).toMatchObject({ siteScore: 5, siteScoreVotes: 0 });
    });

    test("a nota de quem terminou regula a nota do site (média com peso inicial)", async ({ request, playwright, baseURL }) => {
      await prisma.anime.update({ where: { id: mine }, data: { watchState: "FINISHED" } });
      const first = await request.patch(`/api/anime/${mine}/score`, { data: { score: 10 } });
      expect(first.status()).toBe(200);
      expect(await first.json()).toEqual({ userScore: 10, siteScore: 6.3, siteScoreVotes: 1 });
      expect(await siteScore()).toMatchObject({ siteScore: 6.3, siteScoreVotes: 1 });

      const admin = await playwright.request.newContext({ baseURL, storageState: adminState });
      const second = await admin.patch(`/api/anime/${adminAnime}/score`, { data: { score: 8 } });
      expect(await second.json()).toEqual({ userScore: 8, siteScore: 6.6, siteScoreVotes: 2 });

      // Tirar a nota de uma pessoa tira o voto dela.
      const cleared = await admin.patch(`/api/anime/${adminAnime}/score`, { data: { score: null } });
      expect(await cleared.json()).toEqual({ userScore: null, siteScore: 6.3, siteScoreVotes: 1 });
      await admin.dispose();
    });

    test("sair de 'Terminei' ou da lista tira a nota da conta", async ({ request }) => {
      expect((await request.patch(`/api/anime/${mine}/watch-state`, { data: { state: "UNFINISHED" } })).status()).toBe(200);
      expect(await siteScore()).toMatchObject({ siteScore: 5, siteScoreVotes: 0 });
      // Volta a terminar: a nota que ela tinha guardada volta a contar.
      expect((await request.patch(`/api/anime/${mine}/watch-state`, { data: { state: "FINISHED" } })).status()).toBe(200);
      expect(await siteScore()).toMatchObject({ siteScore: 6.3, siteScoreVotes: 1 });
      expect((await request.delete(`/api/anime/${mine}`)).status()).toBe(200);
      expect(await siteScore()).toMatchObject({ siteScore: 5, siteScoreVotes: 0 });
    });
  });

  test("quem terminou a temporada dá a nota na própria página e a nota do site mostra o resultado", async ({ page }) => {
    const own = await prisma.anime.create({ data: { userId, anilistId: FR1, titleRomaji: "Temporadas Round94", genres: "", watchState: "FINISHED", seriesKey: "temporadas round94", seasonNumber: 1 } });
    try {
      await page.goto(`/anime/${own.id}`);
      await expect(page.getByTestId("site-score")).toHaveText("Nota do site 5.0");
      const score = page.getByTestId(`season-score-${FR1}`);
      await expect(score).toBeVisible();
      await expect(page.getByTestId(`season-score-${FR2}`)).toHaveCount(0); // a outra temporada não está na lista
      await score.selectOption("8");
      await expect(page.getByTestId("site-score")).toHaveText("Nota do site 5.8"); // (3 × 5 + 8) ÷ 4
      expect((await prisma.anime.findUniqueOrThrow({ where: { id: own.id } })).userScore).toBe(8);
      await score.selectOption("");
      await expect(page.getByTestId("site-score")).toHaveText("Nota do site 5.0");
    } finally {
      await prisma.anime.delete({ where: { id: own.id } });
    }
  });

  test("a obra mostra o aviso e a seção dos especiais; 'Temporadas' fica só com episódios", async ({ page }) => {
    await page.goto(`/anime/${ROOT}`);
    await expect(page.getByTestId("site-score")).toHaveText("Nota do site 5.0");
    await expect(page.getByTestId("specials-notice")).toContainText("1 OVA, 1 ODA, 1 filme");
    await expect(page.getByTestId("specials-notice")).toContainText("fora da linha principal");

    const specials = page.getByTestId("work-specials");
    await expect(specials.locator("li")).toHaveCount(3);
    await expect(specials.getByTestId(`special-kind-${OVA}`)).toHaveText("OVA");
    await expect(specials.getByTestId(`special-kind-${ODA}`)).toHaveText("ODA");
    await expect(specials.getByTestId(`special-kind-${MOVIE}`)).toHaveText("Filme");
    await expect(specials.getByText("Opcional")).toHaveCount(3);
    await expect(specials.getByRole("link", { name: "Serie Round94 OVA" })).toHaveAttribute("href", `/anime/${OVA}`);
    // Ordem de estreia: OVA, depois ODA, depois filme.
    await expect(specials.locator("li").nth(0)).toContainText("Serie Round94 OVA");
    await expect(specials.locator("li").nth(2)).toContainText("Serie Round94 Movie");

    // O OVA é uma produção da mesma franquia, mas não conta como temporada.
    await expect(page.getByTestId("franchise-seasons")).toHaveCount(0);
  });

  test("a página de um especial se marca como atual e não conta a si mesma no aviso", async ({ page }) => {
    await page.goto(`/anime/${OVA}`);
    await expect(page.getByTestId("specials-notice")).toContainText("1 ODA, 1 filme");
    await expect(page.getByTestId("specials-notice")).not.toContainText("OVA,");
    await expect(page.getByTestId(`special-${OVA}`)).toContainText("você está aqui");
    await expect(page.getByTestId("work-specials").locator("li")).toHaveCount(3);
  });

  test("obra sem especiais não mostra aviso nem seção", async ({ page }) => {
    await prisma.production.create({ data: { anilistId: SCORED, franchiseId: (await prisma.franchise.findUniqueOrThrow({ where: { rootAnilistId: FR1 } })).id, titleRomaji: "Nota Round94", seasonNumber: 3, format: "TV", description: "x", genres: "Drama", streamingLinksJson: "[]", fetchedAt: new Date() } });
    await page.goto(`/anime/${SCORED}`);
    await expect(page.getByTestId("anime-title")).toBeVisible();
    await expect(page.getByTestId("specials-notice")).toHaveCount(0);
    await expect(page.getByTestId("work-specials")).toHaveCount(0);
  });
});
