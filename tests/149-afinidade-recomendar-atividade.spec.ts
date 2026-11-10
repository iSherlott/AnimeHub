import { test, expect, type Browser } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_USER_EMAIL } from "./test-auth";

// Pedido de 10/11: afinidade com um amigo, recomendar uma obra a um amigo e a atividade dos amigos (só de quem liga).
const base = { passwordHash: "e2e-fixture-not-a-real-hash", passwordSalt: "e2e-fixture-not-a-real-salt" };
const EMAILS = ["ana-149@test.local", "zeca-149@test.local"];
const ANA_TOKEN = "e2e-session-ana-149-0000000000000000000000000000";
const pair = (a: string, b: string) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });
const W = [149001, 149002, 149003, 149004, 149005];
const RECOMMENDED = 149009;
const ALL = [...W, RECOMMENDED];

test.describe.serial("Afinidade, recomendar a um amigo e atividade dos amigos", () => {
  let prisma: PrismaClient;
  let userId = "";
  const id: Record<string, string> = {};
  const anaHeaders = { Cookie: `${SESSION_COOKIE_NAME}=${ANA_TOKEN}` };

  async function anaContext(browser: Browser) {
    return browser.newContext({
      storageState: { cookies: [{ name: SESSION_COOKIE_NAME, value: ANA_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 3600, httpOnly: true, secure: false, sameSite: "Lax" }], origins: [] },
      baseURL: test.info().project.use.baseURL,
    });
  }

  async function clean() {
    await prisma.friendship.deleteMany({ where: { OR: [{ userA: { email: { in: EMAILS } } }, { userB: { email: { in: EMAILS } } }] } });
    await prisma.workRecommendation.deleteMany({ where: { OR: [{ from: { email: { in: EMAILS } } }, { to: { email: { in: EMAILS } } }] } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await prisma.production.deleteMany({ where: { anilistId: RECOMMENDED } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: RECOMMENDED } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: ALL } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();
    for (const anilistId of W) await prisma.catalogEntry.create({ data: { anilistId, titleRomaji: `Obra ${anilistId} Round149`, source: "anilist", onPlatform: true, genres: "Ação" } });
    const franchise = await prisma.franchise.create({ data: { rootAnilistId: RECOMMENDED, name: "Recomendada Round149" } });
    await prisma.production.create({ data: { anilistId: RECOMMENDED, franchiseId: franchise.id, titleRomaji: "Recomendada Round149", seasonNumber: 1, format: "TV", status: "RELEASING", fetchedAt: new Date() } });
    await prisma.catalogEntry.create({ data: { anilistId: RECOMMENDED, titleRomaji: "Recomendada Round149", source: "anilist", onPlatform: true } });
    id.ana = (await prisma.user.create({ data: { ...base, email: EMAILS[0], displayName: "Ana Round149", handle: "ana_r149" } })).id;
    id.zeca = (await prisma.user.create({ data: { ...base, email: EMAILS[1], displayName: "Zeca Round149", handle: "zeca_r149" } })).id;
    await prisma.session.create({ data: { token: ANA_TOKEN, userId: id.ana, expiresAt: new Date(Date.now() + 3600_000) } });
    await prisma.friendship.create({ data: pair(userId, id.ana) });
    const entry = (anilistId: number) => ({ anilistId, titleRomaji: `Obra ${anilistId} Round149`, genres: "Ação" });
    // A pessoa: 149001-149003. A Ana: 149001-149002 e 149004-149005 (duas em comum).
    await prisma.anime.createMany({
      data: [
        ...[W[0], W[1], W[2]].map((a) => ({ userId, ...entry(a) })),
        ...[W[0], W[1], W[3], W[4]].map((a) => ({ userId: id.ana, ...entry(a) })),
      ],
    });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("o perfil da amiga mostra a afinidade, as obras em comum e o que só ela acompanha", async ({ page }) => {
    await page.goto(`/users/${id.ana}`);
    const box = page.getByTestId("profile-affinity");
    await expect(box.getByTestId("affinity-percent")).toHaveText(/^\d{1,3}%$/);
    // A conta de teste pode ter outras obras: confere o que é desta spec.
    await expect(box.getByTestId("affinity-only-theirs").filter({ hasText: "Round149" }).first()).toBeVisible();
    // No próprio perfil a caixa não aparece.
    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("profile-affinity")).toHaveCount(0);
  });

  test("lista escondida: sem afinidade", async ({ page }) => {
    await prisma.user.update({ where: { id: id.ana }, data: { animeListPublic: false } });
    await page.goto(`/users/${id.ana}`);
    await expect(page.getByRole("heading", { name: "Ana Round149" }).first()).toBeVisible();
    await expect(page.getByTestId("profile-affinity")).toHaveCount(0);
    await prisma.user.update({ where: { id: id.ana }, data: { animeListPublic: true } });
  });

  test("recomendar pela página da obra: escolhe a amiga, escreve o bilhete e ela recebe no sino e em Amigos", async ({ page, browser }) => {
    await page.goto(`/anime/${RECOMMENDED}`);
    await page.getByTestId("recommend-open").click();
    const dialog = page.getByRole("dialog", { name: "Recomendar Recomendada Round149" });
    await dialog.getByLabel("Para quem").click();
    await page.getByRole("option", { name: "Ana Round149" }).click();
    await dialog.getByTestId("recommend-note").fill("Você vai gostar do episódio 3!");
    await dialog.getByTestId("recommend-send").click();
    await expect(dialog.getByTestId("recommend-sent")).toHaveText("Recomendado para Ana Round149.");

    const ana = await anaContext(browser);
    const bell = await (await ana.request.get("/api/notifications")).json();
    const notice = (bell.social as { type: string; href: string; subject: string }[]).find((n) => n.type === "WORK_RECOMMENDATION");
    expect(notice).toMatchObject({ href: "/amigos#recomendacoes", subject: "Recomendada Round149" });
    const anaPage = await ana.newPage();
    await anaPage.goto("/amigos");
    const rec = anaPage.getByTestId("friend-recommendation").filter({ hasText: "Recomendada Round149" });
    await expect(rec).toContainText("Você vai gostar do episódio 3!");
    await expect(rec.getByRole("link", { name: "Recomendada Round149" })).toHaveAttribute("href", `/anime/${RECOMMENDED}`);
    await ana.close();
  });

  test("regras: não repete a mesma obra, só para amigos, bilhete com limite", async ({ request }) => {
    const again = await request.post("/api/recommendations", { data: { to: id.ana, work: String(RECOMMENDED) } });
    expect(again.status()).toBe(409);
    const stranger = await request.post("/api/recommendations", { data: { to: id.zeca, work: String(W[0]) } });
    expect(stranger.status()).toBe(403);
    const long = await request.post("/api/recommendations", { data: { to: id.ana, work: String(W[2]), note: "x".repeat(201) } });
    expect(long.status()).toBe(400);
    // Quem desliga as recomendações não recebe o aviso (a recomendação fica em Amigos).
    await prisma.user.update({ where: { id: id.ana }, data: { notifyRecommendations: false } });
    expect((await request.post("/api/recommendations", { data: { to: id.ana, work: String(W[2]) } })).status()).toBe(201);
    expect(await prisma.socialNotification.count({ where: { userId: id.ana, type: "WORK_RECOMMENDATION" } })).toBe(1);
  });

  test("atividade: só aparece de quem liga o compartilhamento, junta terminar e nota, e some ao desligar", async ({ page, request }) => {
    const anaAnime = await prisma.anime.findFirstOrThrow({ where: { userId: id.ana, anilistId: W[3] } });
    // Desligado (padrão): terminar não aparece para ninguém.
    await request.patch(`/api/anime/${anaAnime.id}/watch-state`, { headers: anaHeaders, data: { state: "FINISHED" } });
    expect((await (await request.get("/api/feed/activity")).json()).activity).toEqual([]);
    // Liga, termina de novo e dá nota.
    expect((await request.patch("/api/users/me/settings", { headers: anaHeaders, data: { shareActivity: true } })).status()).toBe(200);
    await request.patch(`/api/anime/${anaAnime.id}/watch-state`, { headers: anaHeaders, data: { state: null } });
    await request.patch(`/api/anime/${anaAnime.id}/watch-state`, { headers: anaHeaders, data: { state: "FINISHED" } });
    await request.patch(`/api/anime/${anaAnime.id}/score`, { headers: anaHeaders, data: { score: 9 } });
    const { activity } = await (await request.get("/api/feed/activity")).json();
    expect(activity).toHaveLength(1);
    expect(activity[0]).toMatchObject({ workKey: String(W[3]), finished: true, score: 9, user: { displayName: "Ana Round149" } });

    await page.goto("/");
    const item = page.getByTestId("sidebar-friend-activity").getByTestId("friend-activity-item").first();
    await expect(item).toContainText("Ana Round149");
    await expect(item).toContainText(`terminou Obra ${W[3]} Round149 e deu 9`);

    // Desligar apaga o que tinha aparecido.
    await request.patch("/api/users/me/settings", { headers: anaHeaders, data: { shareActivity: false } });
    expect((await (await request.get("/api/feed/activity")).json()).activity).toEqual([]);
  });
});
