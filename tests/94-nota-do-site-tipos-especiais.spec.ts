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
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: ALL } } });
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

    test("dá para avaliar enquanto acompanha, mas só a nota de quem terminou conta no site", async ({ request }) => {
      const res = await request.patch(`/api/anime/${mine}/score`, { data: { score: 9 } });
      expect(res.status()).toBe(200);
      expect(await res.json()).toEqual({ userScore: 9, siteScore: 5, siteScoreVotes: 0 });
      expect(await siteScore()).toMatchObject({ siteScore: 5, siteScoreVotes: 0 });
      expect((await request.patch(`/api/anime/${mine}/score`, { data: { score: null } })).status()).toBe(200);
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
      await expect(page.getByTestId(`season-score-value-${FR1}`)).toHaveText("Sem nota");
      await score.locator("label", { hasText: "4 estrelas (nota 8)" }).click(); // 4 estrelas = nota 8
      await expect(page.getByTestId("site-score")).toHaveText("Nota do site 5.8"); // (3 × 5 + 8) ÷ 4
      await expect(page.getByTestId(`season-score-value-${FR1}`)).toHaveText("Sua nota: 8/10");
      expect((await prisma.anime.findUniqueOrThrow({ where: { id: own.id } })).userScore).toBe(8);
      await score.locator("label", { hasText: "4 estrelas (nota 8)" }).click(); // de novo na mesma nota: tira a avaliação
      await expect(page.getByTestId("site-score")).toHaveText("Nota do site 5.0");
      await expect(page.getByTestId(`season-score-value-${FR1}`)).toHaveText("Sem nota");
    } finally {
      await prisma.anime.delete({ where: { id: own.id } });
    }
  });

  test("sem episódios com data, a obra ainda mostra os especiais ramificados da linha do tempo", async ({ page }) => {
    await page.goto(`/anime/${ROOT}`);
    const only = page.getByTestId("branch-only-timeline");
    await expect(only).toContainText("ainda não têm data no calendário");
    await expect(only.locator("li")).toHaveCount(3);
    await expect(only.getByTestId(`branch-kind-${OVA}`)).toHaveText("OVA");
    await expect(only.getByTestId(`branch-kind-${ODA}`)).toHaveText("ODA");
    await expect(only.getByTestId(`branch-kind-${MOVIE}`)).toHaveText("Filme");
  });

  test("os especiais se ramificam da linha dos episódios, no ponto em que foram ao ar; 'Temporadas' fica só com episódios", async ({ page }) => {
    // Episódios espalhados no tempo: o OVA (abr/2021) cai entre o 1 e o 2; a ODA (jun/2021) e o filme (mar/2022), entre o 2 e o 3.
    for (const [episode, airingAt] of [[1, "2020-10-01T12:00:00Z"], [2, "2021-05-01T12:00:00Z"], [3, "2022-06-01T12:00:00Z"]] as const) {
      await prisma.airingScheduleEntry.create({ data: { anilistId: ROOT, episode, airingAt: new Date(airingAt), titleRomaji: "Serie Round94" } });
    }
    await page.goto(`/anime/${ROOT}`);
    await expect(page.getByTestId("site-score")).toHaveText("Nota do site 5.0");
    await expect(page.getByTestId("specials-notice")).toContainText("1 OVA, 1 ODA, 1 filme");
    await expect(page.getByTestId("specials-notice")).toContainText("fora da linha principal");

    await expect(page.getByTestId("episode-count")).toHaveText("3 episódios · 3 especiais ramificados");
    await expect(page.getByTestId("schedule-episodes")).not.toBeVisible(); // minimizada por padrão
    await page.getByTestId("episode-toggle").click();
    const line = page.getByTestId("schedule-episodes");
    const nodes = line.locator("li");
    await expect(nodes).toHaveCount(6);
    await expect(nodes.nth(0)).toContainText("EP01");
    await expect(nodes.nth(1)).toContainText("Serie Round94 OVA");
    await expect(nodes.nth(1)).toHaveAttribute("data-branch", "true");
    await expect(nodes.nth(2)).toContainText("EP02");
    await expect(nodes.nth(3)).toContainText("Serie Round94 DVD");
    await expect(nodes.nth(4)).toContainText("Serie Round94 Movie");
    await expect(nodes.nth(5)).toContainText("EP03");
    await expect(nodes.nth(0)).not.toHaveAttribute("data-branch", "true");
    await expect(line.getByTestId(`branch-kind-${OVA}`)).toHaveText("OVA");
    await expect(line.getByTestId(`branch-kind-${ODA}`)).toHaveText("ODA");
    await expect(line.getByTestId(`branch-kind-${MOVIE}`)).toHaveText("Filme");
    await expect(line.getByText("Opcional")).toHaveCount(3);
    await expect(line.getByRole("link", { name: "Serie Round94 OVA" })).toHaveAttribute("href", `/anime/${OVA}`);

    // O OVA é uma produção da mesma franquia, mas não conta como temporada: sem abas.
    await expect(page.getByTestId("franchise-seasons")).toHaveCount(0);
  });

  test("a página de um especial não conta a si mesma no aviso", async ({ page }) => {
    await page.goto(`/anime/${OVA}`);
    await expect(page.getByTestId("specials-notice")).toContainText("1 ODA, 1 filme");
    await expect(page.getByTestId("specials-notice")).not.toContainText("OVA,");
  });

  test("a navegação da franquia vem das relações e, depois da auditoria, da ordem gravada: a mesma linha do tempo, uma só", async ({ page }) => {
    // Antes da auditoria, a franquia sai das relações da AniList, em ordem de estreia.
    const checkNav = async () => {
      const nav = page.getByTestId("franchise-nav");
      await expect(nav.getByTestId("franchise-nav-summary")).toHaveText("1 temporada e 3 especiais (OVA, ODA e filmes), em ordem de estreia.");
      const items = nav.locator("li");
      await expect(items).toHaveCount(4);
      await expect(items.nth(0)).toContainText("Temporada 1");
      await expect(items.nth(0)).toContainText("você está aqui");
      await expect(items.nth(1)).toHaveAttribute("data-branch", "true");
      await expect(items.nth(1)).toContainText("OVA · opcional");
      await expect(items.nth(2)).toContainText("ODA · opcional");
      await expect(items.nth(3)).toContainText("Filme · opcional");
      await expect(nav.getByRole("link", { name: /Serie Round94 Movie/ })).toHaveAttribute("href", `/anime/${MOVIE}`);
    };
    await page.goto(`/anime/${ROOT}`);
    await checkNav();
    await expect(page.getByTestId("franchise-nav")).toHaveCount(1); // uma só linha do tempo da franquia na página
    await expect(page.getByTestId("franchise-timeline")).toHaveCount(0);

    const stored: Array<[number, number, string, number | null]> = [[ROOT, 1, "MAIN", 1], [OVA, 2, "SPECIAL", null], [ODA, 3, "SPECIAL", null], [MOVIE, 4, "SPECIAL", null]];
    for (const [anilistId, timelineOrder, timelineRole, timelineSeason] of stored) {
      await prisma.catalogEntry.update({ where: { anilistId }, data: { franchiseKey: ROOT, timelineOrder, timelineRole, timelineSeason } });
    }
    await page.goto(`/anime/${ROOT}`);
    await checkNav();

    // Na página de um especial, é ele que aparece como atual.
    await page.goto(`/anime/${OVA}`);
    await expect(page.getByTestId(`franchise-nav-item-${OVA}`)).toContainText("você está aqui");
    await expect(page.getByTestId(`franchise-nav-item-${ROOT}`)).not.toContainText("você está aqui");
  });

  test("obra sem especiais não mostra aviso nem seção", async ({ page }) => {
    await prisma.production.create({ data: { anilistId: SCORED, franchiseId: (await prisma.franchise.findUniqueOrThrow({ where: { rootAnilistId: FR1 } })).id, titleRomaji: "Nota Round94", seasonNumber: 3, format: "TV", description: "x", genres: "Drama", streamingLinksJson: "[]", fetchedAt: new Date() } });
    await page.goto(`/anime/${SCORED}`);
    await expect(page.getByTestId("anime-title")).toBeVisible();
    await expect(page.getByTestId("specials-notice")).toHaveCount(0);
    await expect(page.getByTestId("franchise-nav")).toHaveCount(0);
  });
});
