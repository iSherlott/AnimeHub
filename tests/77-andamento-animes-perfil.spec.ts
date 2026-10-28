import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Andamento dos animes (modo misto): a plataforma deduz — episódio adiado = "Não terminei", no ar = "Acompanhando
// nesta temporada", já exibido = "Terminei" — e a pessoa pode marcar na mão. O perfil separa por categoria.
const AIRING = 977001; // continuação no ar
const FINISHED = 977002; // novo que já terminou de ser exibido
const UPCOMING = 977003; // sequência que só estreia depois
const BEHIND = 977004; // no ar, mas parei num episódio
const IDS = [AIRING, FINISHED, UPCOMING, BEHIND];
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test.describe.serial("Andamento dos animes no perfil", () => {
  let prisma: PrismaClient;
  let userId: string;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await prisma.pendingEpisode.deleteMany({ where: { userId, anilistId: { in: IDS } } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: IDS } } });
    const cover = (n: string) => `https://s4.anilist.co/file/anilistcdn/spec77/${n}.png`;
    const base = (anilistId: number, titleRomaji: string, status: string, extra: Record<string, unknown> = {}) => ({ userId, anilistId, titleRomaji, status, genres: "Comedy", coverImage: cover(String(anilistId)), ...extra });
    await prisma.anime.create({ data: base(AIRING, "Continuacao No Ar Round77", "RELEASING") });
    await prisma.anime.create({ data: base(FINISHED, "Novo Terminado Round77", "FINISHED") });
    // Estreia em outra temporada (bem à frente): não é "desta temporada".
    await prisma.anime.create({ data: base(UPCOMING, "Sequencia Futura Round77", "NOT_YET_RELEASED", { season: "WINTER", seasonYear: 2099 }) });
    const behind = await prisma.anime.create({ data: base(BEHIND, "Parei No Meio Round77", "RELEASING") });
    await prisma.pendingEpisode.create({ data: { userId, anilistId: BEHIND } });
    expect(behind.id).toBeTruthy();
  });

  test.afterAll(async () => {
    await prisma.pendingEpisode.deleteMany({ where: { userId, anilistId: { in: IDS } } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: IDS } } });
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    await page.route(/s4\.anilist\.co\/file\/anilistcdn\/spec77/, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  });

  async function openAnimes(page: import("@playwright/test").Page) {
    await page.goto(`/users/${userId}`);
    await page.getByTestId("tab-animes").click();
    return page.getByTestId("profile-anime-list");
  }

  test("a plataforma deduz a categoria dos 4 cenários", async ({ page }) => {
    const list = await openAnimes(page);
    await expect(list.getByTestId(`profile-anime-category-${AIRING}`)).toHaveText("Assistindo");
    await expect(list.getByTestId(`profile-anime-category-${FINISHED}`)).toHaveText("Terminei");
    await expect(list.getByTestId(`profile-anime-category-${BEHIND}`)).toHaveText("Não terminei");
    await expect(list.getByTestId(`profile-anime-category-${UPCOMING}`)).toHaveText("Em breve"); // só em "Todos"
  });

  test("os álbuns automáticos separam as obras pelo andamento (a aba Animes não repete os filtros)", async ({ page }) => {
    const list = await openAnimes(page);
    await expect(list.getByTestId("category-watching")).toHaveCount(0);
    await page.goto(`/users/${userId}/albuns/assistindo`);
    await expect(page.getByTestId(`album-work-${AIRING}`)).toBeVisible();
    await expect(page.getByTestId(`album-work-${FINISHED}`)).toHaveCount(0);
    await page.goto(`/users/${userId}/albuns/nao-terminei`);
    await expect(page.getByTestId(`album-work-${BEHIND}`)).toBeVisible();
    await expect(page.getByTestId(`album-work-${AIRING}`)).toHaveCount(0);
    await page.goto(`/users/${userId}/albuns/terminei`);
    await expect(page.getByTestId(`album-work-${FINISHED}`)).toBeVisible();
    await expect(page.getByTestId(`album-work-${UPCOMING}`)).toHaveCount(0);
  });

  test("marcar na mão vale mais que a dedução; 'automático' devolve à plataforma", async ({ page }) => {
    const list = await openAnimes(page);
    // Terminei de ver o que ainda está no ar: sai de "Assistindo" e a marcação fica salva.
    await list.getByTestId(`watch-state-${AIRING}`).selectOption("FINISHED");
    await expect(list.getByTestId(`profile-anime-category-${AIRING}`)).toHaveText("Terminei");
    expect((await prisma.anime.findFirstOrThrow({ where: { userId, anilistId: AIRING } })).watchState).toBe("FINISHED");

    // "Terminei" tira a obra adiada de "Para assistir".
    await list.getByTestId(`watch-state-${BEHIND}`).selectOption("FINISHED");
    await expect(list.getByTestId(`profile-anime-category-${BEHIND}`)).toHaveText("Terminei");
    expect(await prisma.pendingEpisode.count({ where: { userId, anilistId: BEHIND } })).toBe(0);

    // Já terminou de ser exibido, mas ainda não vi tudo.
    await list.getByTestId(`watch-state-${FINISHED}`).selectOption("UNFINISHED");
    await expect(list.getByTestId(`profile-anime-category-${FINISHED}`)).toHaveText("Não terminei");

    // Sequência futura que quero acompanhar já.
    await list.getByTestId(`watch-state-${UPCOMING}`).selectOption("WATCHING");
    await expect(list.getByTestId(`profile-anime-category-${UPCOMING}`)).toHaveText("Assistindo");

    // Automático: volta a ser deduzido.
    await list.getByTestId(`watch-state-${AIRING}`).selectOption("");
    await expect(list.getByTestId(`profile-anime-category-${AIRING}`)).toHaveText("Assistindo");
    expect((await prisma.anime.findFirstOrThrow({ where: { userId, anilistId: AIRING } })).watchState).toBeNull();
  });

  test("API: valida o estado e só aceita obra da própria lista", async ({ request }) => {
    const own = await prisma.anime.findFirstOrThrow({ where: { userId, anilistId: AIRING } });
    expect((await request.patch(`/api/anime/${own.id}/watch-state`, { data: { state: "QUASE" } })).status()).toBe(400);
    expect((await request.patch(`/api/anime/${own.id}/watch-state`, { data: {} })).status()).toBe(400);
    expect((await request.patch(`/api/anime/inexistente/watch-state`, { data: { state: null } })).status()).toBe(404);
  });

  test("adiar a obra desfaz o 'Terminei' marcado antes", async ({ request }) => {
    const own = await prisma.anime.findFirstOrThrow({ where: { userId, anilistId: AIRING } });
    expect((await request.patch(`/api/anime/${own.id}/watch-state`, { data: { state: "FINISHED" } })).status()).toBe(200);
    const res = await request.post("/api/pending", { data: { anilistId: AIRING } });
    expect(res.status()).toBeLessThan(300);
    expect((await prisma.anime.findFirstOrThrow({ where: { userId, anilistId: AIRING } })).watchState).toBeNull();
    await prisma.pendingEpisode.deleteMany({ where: { userId, anilistId: AIRING } });
  });

  test("outras contas veem as categorias (se a lista é pública), mas sem controles nem ids internos; sem conta, nada", async ({ browser }) => {
    const nobody = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: { cookies: [], origins: [] } });
    expect((await nobody.request.get(`/api/users/${userId}/animes`)).status()).toBe(401);
    await nobody.close();
    const anon = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: { cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }], origins: [] } });
    const body = await (await anon.request.get(`/api/users/${userId}/animes?category=finished`)).json();
    expect(body.entries.every((e: { category: string }) => e.category === "finished")).toBe(true);
    expect(body.categories).toEqual(expect.objectContaining({ watching: expect.any(Number), unfinished: expect.any(Number), finished: expect.any(Number) }));
    expect(JSON.stringify(body)).not.toMatch(/animeId|watchState|"waiting"/);

    const page = await anon.newPage();
    await page.goto(`/users/${userId}`);
    await page.getByTestId("tab-animes").click();
    const list = page.getByTestId("profile-anime-list");
    await expect(list.getByTestId(`profile-anime-${FINISHED}`)).toBeVisible();
    await expect(list.locator("select")).toHaveCount(0);
    // Álbuns e lista são as duas vistas da mesma seção.
    await page.getByTestId("tab-albums").click();
    await expect(page.getByTestId("profile-albums").getByTestId("album-terminei")).toBeVisible();
    await anon.close();
  });
});
