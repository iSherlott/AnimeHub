import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Continuação e retorno: obra que volta a sair episódios (mesma entrada ou nova temporada) volta à lista/calendário,
// sai de "Terminei" e avisa. A continuação é achada pela franquia e, sem ela, pelo título.
const S1 = 980001; // temporada 1, terminada (franquia)
const S2 = 980002; // temporada 2 estreando
const COMEBACK = 980003; // a mesma obra retomando
const T1 = 980004; // temporada 1 (sem franquia: pelo título)
const T2 = 980005; // "2nd Season" só no catálogo
const W1 = 980006; // temporada 1 em espera
const W2 = 980007; // continuação da em espera
const ALL = [S1, S2, COMEBACK, T1, T2, W1, W2];
const DAY = 24 * 3600 * 1000;

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Continuação e retorno de obras", () => {
  let prisma: PrismaClient;
  let userId: string;

  async function clean() {
    await prisma.airingAlert.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: ALL } } });
    await prisma.catalogEntry.deleteMany({ where: { anilistId: { in: ALL } } });
  }

  const runSync = async (playwright: import("@playwright/test").PlaywrightWorkerArgs["playwright"], baseURL: string | undefined) => {
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
    await prisma.user.update({ where: { id: userId }, data: { notifyReleases: true } });
    await clean();
    const soon = new Date(Date.now() + 3 * DAY);

    // Franquia: S1 terminada, S2 estreando.
    const franchise = await prisma.franchise.create({ data: { rootAnilistId: S1, name: "Franquia Round80" } });
    const prod = (anilistId: number, titleRomaji: string, seasonNumber: number, status: string) =>
      prisma.production.create({ data: { anilistId, franchiseId: franchise.id, titleRomaji, seasonNumber, status, format: "TV", genres: "Comedy", streamingLinksJson: "[]", fetchedAt: new Date() } });
    await prod(S1, "Franquia Round80", 1, "FINISHED");
    await prod(S2, "Franquia Round80 Season 2", 2, "NOT_YET_RELEASED");
    await prisma.catalogEntry.create({ data: { anilistId: S2, titleRomaji: "Franquia Round80 Season 2", status: "NOT_YET_RELEASED", genres: "Comedy", source: "anilist", onPlatform: true } });
    await prisma.anime.create({ data: { userId, anilistId: S1, titleRomaji: "Franquia Round80", status: "FINISHED", watchState: "FINISHED", seriesKey: "franquia round80", seasonNumber: 1 } });

    // A mesma obra, terminada, retomando.
    await prisma.catalogEntry.create({ data: { anilistId: COMEBACK, titleRomaji: "Retomada Round80", status: "RELEASING", genres: "Drama", source: "anilist", onPlatform: true } });
    await prisma.anime.create({ data: { userId, anilistId: COMEBACK, titleRomaji: "Retomada Round80", status: "FINISHED", watchState: "FINISHED" } });

    // Sem franquia: a continuação só existe no catálogo e é achada pelo título.
    await prisma.anime.create({ data: { userId, anilistId: T1, titleRomaji: "Titulo Round80", status: "FINISHED", seriesKey: "titulo round80", seasonNumber: 1 } });
    await prisma.catalogEntry.create({ data: { anilistId: T2, titleRomaji: "Titulo Round80 2nd Season", status: "NOT_YET_RELEASED", genres: "Comedy", source: "anilist", onPlatform: true } });

    // Em espera: a pessoa não quer acompanhar, então a continuação não entra sozinha.
    await prisma.anime.create({ data: { userId, anilistId: W1, titleRomaji: "Espera Round80", status: "FINISHED", seriesKey: "espera round80", seasonNumber: 1, waiting: true } });
    await prisma.catalogEntry.create({ data: { anilistId: W2, titleRomaji: "Espera Round80 Season 2", status: "NOT_YET_RELEASED", genres: "Comedy", source: "anilist", onPlatform: true } });

    for (const anilistId of [S2, COMEBACK, T2, W2]) {
      await prisma.airingScheduleEntry.create({ data: { anilistId, episode: 1, airingAt: soon, titleRomaji: `Ep ${anilistId}` } });
    }
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("a continuação é acompanhada, a obra retomada sai de 'Terminei' e ambas avisam", async ({ playwright, baseURL }) => {
    const summary = await runSync(playwright, baseURL);
    expect(summary.returned).toBe(1);
    expect(summary.followed).toBe(2); // S2 (pela franquia) e T2 (pelo título)

    // Pela franquia: entra na lista junto da temporada anterior (mesma série, temporada 2).
    const s2 = await prisma.anime.findUniqueOrThrow({ where: { userId_anilistId: { userId, anilistId: S2 } } });
    expect(s2).toMatchObject({ seriesKey: "franquia round80", seasonNumber: 2, status: "NOT_YET_RELEASED" });
    // Pelo título, sem nenhuma relação da AniList.
    const t2 = await prisma.anime.findUniqueOrThrow({ where: { userId_anilistId: { userId, anilistId: T2 } } });
    expect(t2).toMatchObject({ seriesKey: "titulo round80", seasonNumber: 2 });
    // A temporada 1 segue terminada: o que muda é a nova entrar em "Acompanhando".
    expect((await prisma.anime.findUniqueOrThrow({ where: { userId_anilistId: { userId, anilistId: S1 } } })).watchState).toBe("FINISHED");

    // A mesma obra que retomou: sai de "Terminei" (situação atualizada, marcação manual removida).
    const back = await prisma.anime.findUniqueOrThrow({ where: { userId_anilistId: { userId, anilistId: COMEBACK } } });
    expect(back).toMatchObject({ status: "RELEASING", watchState: null });

    for (const id of [S2, T2, COMEBACK]) {
      const alert = await prisma.airingAlert.findUniqueOrThrow({ where: { userId_anilistId_episode: { userId, anilistId: id, episode: 0 } } });
      expect(alert).toMatchObject({ kind: "RETURN", seenAt: null });
    }
  });

  test("em espera não ganha a continuação sozinha", async () => {
    expect(await prisma.anime.count({ where: { userId, anilistId: W2 } })).toBe(0);
  });

  test("rodar de novo não repete nada, e quem tirou a continuação da lista não a vê voltar", async ({ playwright, baseURL }) => {
    expect(await runSync(playwright, baseURL)).toMatchObject({ returned: 0, followed: 0, alerts: 0 });
    await prisma.anime.delete({ where: { userId_anilistId: { userId, anilistId: T2 } } });
    expect(await runSync(playwright, baseURL)).toMatchObject({ returned: 0, followed: 0, alerts: 0 });
    expect(await prisma.anime.count({ where: { userId, anilistId: T2 } })).toBe(0);
    expect(await prisma.airingAlert.count({ where: { userId, anilistId: { in: [S2, T2, COMEBACK] }, episode: 0 } })).toBe(3);
  });

  test("o aviso chega nas notificações e no painel, e só o admin dispara a procura", async ({ page, request, playwright, baseURL }) => {
    const data = await (await request.get("/api/notifications")).json();
    const returned = data.alerts.filter((a: { kind: string }) => a.kind === "RETURN").map((a: { anilistId: number }) => a.anilistId);
    expect(returned).toEqual(expect.arrayContaining([S2, COMEBACK]));

    await page.goto("/dashboard");
    await expect(page.getByTestId("dashboard-returned")).toContainText("VOLTOU A SAIR EPISÓDIOS");

    const guest = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await guest.post("/api/admin/continuations/sync")).status()).toBe(401);
    await guest.dispose();
    expect((await request.post("/api/admin/continuations/sync")).status()).toBe(403);
  });
});
