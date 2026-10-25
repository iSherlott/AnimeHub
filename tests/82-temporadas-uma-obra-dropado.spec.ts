import { test, expect } from "@playwright/test";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Épico das temporadas: quem acompanha a 3ª já tem as anteriores (como "Terminei"); as temporadas contam como UM anime;
// e "Dropei" numa temporada (vi até aqui e desisti) tira ela do calendário e dos avisos e impede que as próximas entrem.
const A1 = 982001;
const A2 = 982002;
const A3 = 982003; // o usuário só acompanha esta; as anteriores vêm sozinhas
const D1 = 982011;
const D2 = 982012; // será dropada
const D3 = 982013; // continuação nova no ar
const ALL = [A1, A2, A3, D1, D2, D3];
const DAY = 24 * 3600 * 1000;

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Temporadas de uma obra: lista única, anteriores automáticas e 'Dropei'", () => {
  let prisma: PrismaClient;
  let userId: string;

  async function clean() {
    await prisma.airingAlert.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: ALL } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: ALL } } });
  }

  const sync = async (playwright: import("@playwright/test").PlaywrightWorkerArgs["playwright"], baseURL: string | undefined) => {
    const admin = await playwright.request.newContext({ baseURL, storageState: adminState });
    const res = await admin.post("/api/admin/continuations/sync");
    expect(res.status()).toBe(200);
    const body = await res.json();
    await admin.dispose();
    return body as { returned: number; followed: number; alerts: number; backfilled: number };
  };

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await prisma.user.update({ where: { id: userId }, data: { notifyReleases: true, animeListPublic: true } });
    await clean();

    const make = async (rootId: number, name: string, seasons: Array<[number, string, number, string]>) => {
      const franchise = await prisma.franchise.create({ data: { rootAnilistId: rootId, name } });
      for (const [anilistId, titleRomaji, seasonNumber, status] of seasons) {
        await prisma.production.create({ data: { anilistId, franchiseId: franchise.id, titleRomaji, seasonNumber, status, format: "TV", genres: "Comedy", streamingLinksJson: "[]", fetchedAt: new Date() } });
        await prisma.catalogEntry.create({ data: { anilistId, titleRomaji, status, genres: "Comedy", source: "anilist", onPlatform: true } });
      }
    };
    await make(A1, "Obra Tres Round82", [[A1, "Obra Tres Round82", 1, "FINISHED"], [A2, "Obra Tres Round82 Season 2", 2, "FINISHED"], [A3, "Obra Tres Round82 Season 3", 3, "FINISHED"]]);
    await make(D1, "Obra Dropada Round82", [[D1, "Obra Dropada Round82", 1, "FINISHED"], [D2, "Obra Dropada Round82 Season 2", 2, "FINISHED"], [D3, "Obra Dropada Round82 Season 3", 3, "NOT_YET_RELEASED"]]);

    // O usuário só tem a 3ª de uma obra e a 1ª e a 2ª da outra.
    await prisma.anime.create({ data: { userId, anilistId: A3, titleRomaji: "Obra Tres Round82 Season 3", status: "FINISHED", seriesKey: "obra tres round82", seasonNumber: 3 } });
    await prisma.anime.create({ data: { userId, anilistId: D1, titleRomaji: "Obra Dropada Round82", status: "FINISHED", watchState: "FINISHED", seriesKey: "obra dropada round82", seasonNumber: 1 } });
    await prisma.anime.create({ data: { userId, anilistId: D2, titleRomaji: "Obra Dropada Round82 Season 2", status: "FINISHED", seriesKey: "obra dropada round82", seasonNumber: 2 } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("quem acompanha a 3ª temporada ganha as anteriores como 'Terminei'", async ({ playwright, baseURL }) => {
    const summary = await sync(playwright, baseURL);
    expect(summary.backfilled).toBeGreaterThanOrEqual(2);
    const rows = await prisma.anime.findMany({ where: { userId, anilistId: { in: [A1, A2, A3] } }, orderBy: { seasonNumber: "asc" } });
    expect(rows.map((r) => [r.anilistId, r.seasonNumber, r.watchState])).toEqual([[A1, 1, "FINISHED"], [A2, 2, "FINISHED"], [A3, 3, null]]);
    expect(new Set(rows.map((r) => r.seriesKey)).size).toBe(1); // mesma obra na lista
    // Repetir não duplica nem mexe no que a pessoa já tem.
    expect((await sync(playwright, baseURL)).backfilled).toBe(0);
    expect(await prisma.anime.count({ where: { userId, anilistId: { in: [A1, A2, A3] } } })).toBe(3);
  });

  test("as temporadas contam como UM anime em Minha Lista e no perfil", async ({ page }) => {
    await page.goto("/minha-lista");
    // A obra de 3 temporadas aparece uma vez só, com a contagem.
    await expect(page.getByTestId(`seasons-count-${A3}`)).toHaveText("3 temporadas");
    await expect(page.getByTestId(`seasons-count-${A1}`)).toHaveCount(0);
    await expect(page.getByTestId(`seasons-count-${A2}`)).toHaveCount(0);

    await page.goto(`/users/${userId}`);
    await page.getByTestId("tab-animes").click();
    await expect(page.getByTestId(`profile-anime-seasons-${A3}`)).toHaveText("3 temporadas");
    await expect(page.getByTestId(`profile-anime-${A1}`)).toHaveCount(0);
    const res = await (await page.request.get(`/api/users/${userId}/animes`)).json();
    const mine = res.entries.filter((e: { anilistId: number }) => [A1, A2, A3, D1, D2].includes(e.anilistId));
    expect(mine.map((e: { anilistId: number }) => e.anilistId).sort()).toEqual([D2, A3].sort()); // duas obras: a de 3 temporadas e a de 2
  });

  test("'Dropei' tira a temporada da agenda e dos avisos, pela página da obra", async ({ page }) => {
    const d2 = await prisma.anime.findFirstOrThrow({ where: { userId, anilistId: D2 } });
    await page.goto(`/anime/${d2.id}`);
    const select = page.getByTestId(`season-state-${D2}`);
    await expect(select).toBeVisible();
    await select.selectOption("DROPPED");
    await expect(page.getByTestId(`season-dropped-note-${D2}`)).toBeVisible();
    await expect.poll(async () => (await prisma.anime.findUniqueOrThrow({ where: { id: d2.id } })).watchState).toBe("DROPPED");
    expect((await prisma.anime.findUniqueOrThrow({ where: { id: d2.id } })).waiting).toBe(true); // fora do calendário e dos avisos
    // No perfil a obra vira "Dropado".
    await page.goto(`/users/${userId}`);
    await page.getByTestId("tab-animes").click();
    await expect(page.getByTestId(`profile-anime-category-${D2}`)).toHaveText("Dropado");
  });

  test("com uma temporada dropada, a nova temporada não entra na lista nem avisa", async ({ playwright, baseURL }) => {
    // A 3ª da obra vai ao ar agora, com a 2ª dropada.
    await prisma.airingScheduleEntry.create({ data: { anilistId: D3, episode: 1, airingAt: new Date(Date.now() + 3 * DAY), titleRomaji: "D3" } });
    const summary = await sync(playwright, baseURL);
    expect(summary.followed).toBe(0);
    expect(await prisma.anime.count({ where: { userId, anilistId: D3 } })).toBe(0);
    expect(await prisma.airingAlert.count({ where: { userId, anilistId: D3 } })).toBe(0);
  });

  test("tirar o 'Dropei' devolve a obra à agenda e a nova temporada passa a chegar", async ({ page, playwright, baseURL }) => {
    const d2 = await prisma.anime.findFirstOrThrow({ where: { userId, anilistId: D2 } });
    await page.goto(`/anime/${d2.id}`);
    await page.getByTestId(`season-state-${D2}`).selectOption("");
    await expect.poll(async () => (await prisma.anime.findUniqueOrThrow({ where: { id: d2.id } })).watchState).toBeNull();
    expect((await prisma.anime.findUniqueOrThrow({ where: { id: d2.id } })).waiting).toBe(false);

    // Sair do "Dropei" já recupera as continuações que ficaram sem chegar (em segundo plano); a procura do admin confirma.
    await sync(playwright, baseURL);
    await expect.poll(() => prisma.anime.count({ where: { userId, anilistId: D3 } })).toBe(1);
    expect(await prisma.airingAlert.count({ where: { userId, anilistId: D3, kind: "RETURN" } })).toBe(1);
  });

  test("a API recusa estado inválido e aceita DROPPED", async ({ request }) => {
    const d1 = await prisma.anime.findFirstOrThrow({ where: { userId, anilistId: D1 } });
    expect((await request.patch(`/api/anime/${d1.id}/watch-state`, { data: { state: "DESISTI" } })).status()).toBe(400);
    const ok = await request.patch(`/api/anime/${d1.id}/watch-state`, { data: { state: "DROPPED" } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).anime).toMatchObject({ watchState: "DROPPED", waiting: true });
    // Voltar a acompanhar pela "Espera" desfaz o "dropei".
    const back = await request.patch(`/api/anime/${d1.id}/waiting`, { data: { waiting: false } });
    expect(back.status()).toBe(200);
    expect(await prisma.anime.findUniqueOrThrow({ where: { id: d1.id } })).toMatchObject({ watchState: null, waiting: false });
  });
});
