import { test, expect, type Browser } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME } from "./test-auth";

// Pedido de 12/11: tela "Em breve" (só pelo sino) com as continuações das obras que a pessoa assistiu ou favoritou, e as
// notificações lidas abaixo das não lidas.
const base = { passwordHash: "e2e-fixture-not-a-real-hash", passwordSalt: "e2e-fixture-not-a-real-salt" };
const CORA_EMAIL = "cora-156@test.local";
const CORA_TOKEN = "e2e-session-cora-156-0000000000000000000000000000";
const DAVI_EMAIL = "davi-156@test.local";
const SEEN = 156001; // assistida (Terminei)
const FAV = 156002; // favorita
const PLANNED = 156003; // só guardada, ainda por estrear em outra temporada
const DROPPED = 156004; // dropada
const SEQ_SOON = 156011; // continuação de SEEN, estreia marcada
const SEQ_UNDATED = 156012; // continuação de SEEN, sem data
const MOVIE_AIRING = 156013; // filme de FAV, já estreou
const SEQ_PLANNED = 156014; // continuação de PLANNED: não entra
const SEQ_DROPPED = 156015; // continuação de DROPPED: não entra
const ALL = [SEEN, FAV, PLANNED, DROPPED, SEQ_SOON, SEQ_UNDATED, MOVIE_AIRING, SEQ_PLANNED, SEQ_DROPPED];

test.describe.serial("Em breve e a ordem do sino", () => {
  let prisma: PrismaClient;
  let coraId = "";

  async function coraContext(browser: Browser) {
    return browser.newContext({
      storageState: { cookies: [{ name: SESSION_COOKIE_NAME, value: CORA_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 3600, httpOnly: true, secure: false, sameSite: "Lax" }], origins: [] },
      baseURL: test.info().project.use.baseURL,
    });
  }

  async function clean() {
    await prisma.user.deleteMany({ where: { email: { in: [CORA_EMAIL, DAVI_EMAIL] } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: ALL } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    coraId = (await prisma.user.create({ data: { ...base, email: CORA_EMAIL, displayName: "Cora Round156", handle: "cora_r156" } })).id;
    await prisma.session.create({ data: { token: CORA_TOKEN, userId: coraId, expiresAt: new Date(Date.now() + 3600_000) } });
    const day = 86400_000;
    const catalog: Array<{ anilistId: number; titleRomaji: string; status: string; format?: string; startDate?: Date; relationsJson?: string }> = [
      { anilistId: SEEN, titleRomaji: "Vista Round156", status: "FINISHED" },
      { anilistId: FAV, titleRomaji: "Favorita Round156", status: "FINISHED" },
      { anilistId: PLANNED, titleRomaji: "Guardada Round156", status: "NOT_YET_RELEASED" },
      { anilistId: DROPPED, titleRomaji: "Dropada Round156", status: "FINISHED" },
      { anilistId: SEQ_SOON, titleRomaji: "Vista Round156 2nd Season", status: "NOT_YET_RELEASED", startDate: new Date(Date.now() + 40 * day), relationsJson: JSON.stringify([{ id: SEEN, relationType: "PREQUEL" }]) },
      { anilistId: SEQ_UNDATED, titleRomaji: "Vista Round156 3rd Season", status: "NOT_YET_RELEASED", relationsJson: JSON.stringify([{ id: SEEN, relationType: "PREQUEL" }]) },
      { anilistId: MOVIE_AIRING, titleRomaji: "Favorita Round156 Movie", status: "RELEASING", format: "MOVIE", startDate: new Date(Date.now() - 5 * day), relationsJson: JSON.stringify([{ id: FAV, relationType: "PARENT" }]) },
      { anilistId: SEQ_PLANNED, titleRomaji: "Guardada Round156 2", status: "NOT_YET_RELEASED", relationsJson: JSON.stringify([{ id: PLANNED, relationType: "PREQUEL" }]) },
      { anilistId: SEQ_DROPPED, titleRomaji: "Dropada Round156 2", status: "NOT_YET_RELEASED", relationsJson: JSON.stringify([{ id: DROPPED, relationType: "PREQUEL" }]) },
    ];
    for (const c of catalog) await prisma.catalogEntry.create({ data: { ...c, source: "anilist", onPlatform: true } });
    await prisma.anime.createMany({
      data: [
        { userId: coraId, anilistId: SEEN, titleRomaji: "Vista Round156", status: "FINISHED", watchState: "FINISHED" },
        { userId: coraId, anilistId: FAV, titleRomaji: "Favorita Round156", status: "FINISHED", isFavorite: true },
        { userId: coraId, anilistId: PLANNED, titleRomaji: "Guardada Round156", status: "NOT_YET_RELEASED", season: "WINTER", seasonYear: 2098 },
        { userId: coraId, anilistId: DROPPED, titleRomaji: "Dropada Round156", status: "FINISHED", watchState: "DROPPED" },
      ],
    });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("o sino junta os anúncios numa entrada só, e a tela Em breve mostra só as continuações das obras vistas ou favoritas", async ({ browser }) => {
    const context = await coraContext(browser);
    const page = await context.newPage();
    // Os avisos nascem na consulta do sino.
    const bell = await (await page.request.get("/api/notifications")).json();
    const announced = (bell.social as { type: string; href: string; readAt: string | null }[]).filter((n) => n.type === "WORK_ANNOUNCED");
    expect(announced.map((n) => n.href).sort()).toEqual([`/em-breve#obra-${SEQ_SOON}`, `/em-breve#obra-${SEQ_UNDATED}`, `/em-breve#obra-${MOVIE_AIRING}`].sort());

    await page.goto("/discover");
    await page.getByRole("button", { name: "Notificações" }).click();
    const menu = page.getByRole("menu");
    // Os anúncios não aparecem soltos no Social.
    await menu.getByRole("tab", { name: /Social/ }).click();
    await expect(menu.getByText(/Anunciado:/)).toHaveCount(0);
    await menu.getByRole("tab", { name: /Lançamentos/ }).click();
    const entry = menu.getByTestId("bell-coming-soon");
    await expect(entry).toBeVisible();
    await expect(menu.getByTestId("bell-coming-soon-text")).toContainText("3 continuações anunciadas");
    await expect(menu.getByRole("tab", { name: /Lançamentos · 3/ })).toBeVisible();
    await entry.click();
    await expect(page).toHaveURL(/\/em-breve$/);
    // O sino do cabeçalho zera na hora (sem esperar a próxima consulta).
    await expect(page.getByTestId("bell-counts")).toHaveCount(0);

    // Já no ar primeiro; depois a estreia mais próxima e a sem data. A guardada e a dropada não entram.
    await expect(page.getByTestId("coming-soon-title")).toHaveText(["Favorita Round156 Movie", "Vista Round156 2nd Season", "Vista Round156 3rd Season"]);
    await expect(page.getByTestId("coming-soon-airing").getByTestId("coming-soon-related")).toHaveText("Filme ou especial de Favorita Round156");
    await expect(page.getByTestId("coming-soon-announced").getByTestId("coming-soon-related").first()).toHaveText("Continuação de Vista Round156");
    await expect(page.getByTestId("coming-soon-when").nth(2)).toHaveText("Data de estreia ainda não anunciada");
    await expect(page.getByText("Guardada Round156 2")).toHaveCount(0);
    await expect(page.getByText("Dropada Round156 2")).toHaveCount(0);

    // Abrir a tela leu os anúncios: o contador some.
    const after = await (await page.request.get("/api/notifications")).json();
    expect((after.social as { type: string; readAt: string | null }[]).filter((n) => n.type === "WORK_ANNOUNCED" && !n.readAt)).toHaveLength(0);

    // Chegar pelo link do aviso destaca a obra.
    await page.goto(`/em-breve#obra-${SEQ_UNDATED}`);
    await expect(page.locator(`#obra-${SEQ_UNDATED}`)).toBeInViewport();
    await context.close();
  });

  test("a tela não está em nenhum menu: só o sino leva a ela", async ({ browser }) => {
    const context = await coraContext(browser);
    const page = await context.newPage();
    await page.goto("/discover");
    await expect(page.locator('a[href="/em-breve"]')).toHaveCount(0);
    await page.getByRole("button", { name: "Menu da conta" }).click();
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.locator('a[href="/em-breve"]')).toHaveCount(0);
    await context.close();
  });

  test("as notificações lidas ficam abaixo das não lidas", async ({ browser }) => {
    const davi = await prisma.user.create({ data: { ...base, email: DAVI_EMAIL, displayName: "Davi Round156", handle: "davi_r156" } });
    const now = Date.now();
    // A lida é a mais recente; mesmo assim vai para baixo da não lida, mais antiga.
    await prisma.socialNotification.create({ data: { userId: coraId, actorId: davi.id, type: "NEW_FOLLOWER", createdAt: new Date(now - 60_000) } });
    await prisma.socialNotification.create({ data: { userId: coraId, actorId: davi.id, type: "PROFILE_FAN", createdAt: new Date(now), readAt: new Date(now) } });
    const context = await coraContext(browser);
    const page = await context.newPage();
    await page.goto("/discover");
    await page.getByRole("button", { name: "Notificações" }).click();
    const menu = page.getByRole("menu");
    await menu.getByRole("tab", { name: /Social/ }).click();
    const items = menu.getByTestId("bell-social-item");
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText("começou a seguir você");
    await expect(items.nth(0)).toHaveAttribute("data-read", "false");
    await expect(items.nth(1)).toContainText("virou seu fã");
    await expect(items.nth(1)).toHaveAttribute("data-read", "true");
    await context.close();
  });
});
