import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";
import { FORTUNES } from "../src/lib/dailyFortune";

// Perfil em três colunas: menu, fãs e avaliações à esquerda; sorte do dia (só a dona), quem sou eu, recados e
// depoimentos no centro; amigos (pedido aceito), comunidades e conquistas à direita. Recado: qualquer conta. Depoimento
// e avaliação: só amigos; o depoimento só aparece depois de aprovado. Bloqueio impede tudo isso.
const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};
const PROFILE_TYPES = ["PROFILE_SCRAP", "PROFILE_TESTIMONIAL", "PROFILE_FAN"];

test.describe.serial("Perfil social", () => {
  let prisma: PrismaClient;
  let userId = "";
  let adminId = "";
  let followsBefore: Array<{ followerId: string; followingId: string }> = [];

  async function clean() {
    const pair = [userId, adminId];
    await prisma.scrap.deleteMany({ where: { profileId: { in: pair }, authorId: { in: pair } } });
    await prisma.testimonial.deleteMany({ where: { profileId: { in: pair }, authorId: { in: pair } } });
    await prisma.fan.deleteMany({ where: { fanId: { in: pair }, targetId: { in: pair } } });
    await prisma.profileRating.deleteMany({ where: { raterId: { in: pair }, targetId: { in: pair } } });
    await prisma.socialNotification.deleteMany({ where: { userId: { in: pair }, type: { in: PROFILE_TYPES } } });
    await prisma.block.deleteMany({ where: { blockerId: { in: pair }, blockedId: { in: pair } } });
    await prisma.follow.deleteMany({ where: { followerId: { in: pair }, followingId: { in: pair } } });
    await prisma.friendship.deleteMany({ where: { userAId: { in: pair }, userBId: { in: pair } } });
    await prisma.friendRequest.deleteMany({ where: { fromId: { in: pair }, toId: { in: pair } } });
  }

  // Amizade = pedido aceito (ADR 0012, revisão "amizade separada do seguir").
  async function befriend() {
    const pair = userId < adminId ? { userAId: userId, userBId: adminId } : { userAId: adminId, userBId: userId };
    await prisma.friendship.upsert({ where: { userAId_userBId: pair }, create: pair, update: {} });
  }

  async function unfriend() {
    await prisma.friendship.deleteMany({ where: { userAId: { in: [userId, adminId] }, userBId: { in: [userId, adminId] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    followsBefore = await prisma.follow.findMany({ where: { followerId: { in: [userId, adminId] }, followingId: { in: [userId, adminId] } }, select: { followerId: true, followingId: true } });
    await clean();
  });

  test.afterAll(async () => {
    await clean();
    if (followsBefore.length) await prisma.follow.createMany({ data: followsBefore, skipDuplicates: true });
    await prisma.user.update({ where: { id: userId }, data: { favoriteAnime: null, favoriteCharacter: null, favoriteGenres: [] } });
    await prisma.$disconnect();
  });

  test("o próprio perfil: menu, sorte do dia, quem sou eu com os favoritos, amigos e conquistas", async ({ page, request }) => {
    const saved = await request.patch("/api/users/me", { data: { favoriteAnime: "  Frieren  ", favoriteCharacter: "Himmel", favoriteGenres: ["Fantasia", "Drama", "Fantasia"] } });
    expect(saved.status()).toBe(200);
    expect(await saved.json()).toMatchObject({ favoriteAnime: "Frieren", favoriteCharacter: "Himmel", favoriteGenres: ["Fantasia", "Drama"] });
    expect((await request.patch("/api/users/me", { data: { favoriteGenres: ["a", "b", "c", "d", "e", "f"] } })).status()).toBe(400);
    expect((await request.patch("/api/users/me", { data: { favoriteAnime: "x".repeat(81) } })).status()).toBe(400);
    await befriend();

    await page.goto(`/users/${userId}`);
    await expect(page.getByRole("link", { name: "← Feed" })).toHaveAttribute("href", "/");
    await expect(page.getByTestId("profile-menu")).toContainText("Recados");
    const fortune = (await page.getByTestId("profile-fortune").innerText()).split("\n").pop()?.trim();
    expect(FORTUNES as readonly string[]).toContain(fortune);
    const about = page.getByTestId("profile-about");
    await expect(about).toContainText("Frieren");
    await expect(about).toContainText("Himmel");
    await expect(about).toContainText("Fantasia");
    await expect(about).toContainText("No Anime Hub desde");
    await expect(page.getByTestId("profile-friends")).toContainText("amigos (1)");
    await expect(page.getByTestId("profile-friends").getByRole("link", { name: /E2E Admin/ })).toHaveAttribute("href", `/users/${adminId}`);
    await expect(page.getByTestId("profile-friends").getByRole("link", { name: "gerenciar" })).toHaveAttribute("href", "/amigos");
    await expect(page.getByTestId("profile-achievements").getByRole("link", { name: "minhas conquistas" })).toHaveAttribute("href", "/conquistas");
    // O cartão "só você vê" saiu do perfil (pedido de 28/10): Meus Animes fica no menu do site.
    await expect(page.getByText("Seus animes e álbuns podem ser ocultados")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("perfil-social.png"), fullPage: true });
  });

  test("sorte do dia só para a dona do perfil; quem não entrou não vê o perfil: vai ao login", async ({ browser }) => {
    const admin = await browser.newContext({ storageState: adminState });
    const adminPage = await admin.newPage();
    await adminPage.goto(`/users/${userId}`);
    await expect(adminPage.getByTestId("profile-about")).toContainText("Frieren");
    await expect(adminPage.getByTestId("profile-fortune")).toHaveCount(0);
    await admin.close();

    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anonPage = await anon.newPage();
    await anonPage.goto(`/users/${userId}`);
    await expect(anonPage).toHaveURL(`/login?next=%2Fusers%2F${userId}`);
    expect((await anonPage.request.get(`/api/users/${userId}/scraps`)).status()).toBe(401);
    await anon.close();
  });

  test("recados: qualquer conta escreve, a dona recebe a notificação e pode apagar", async ({ browser, page, request }) => {
    const admin = await browser.newContext({ storageState: adminState });
    const adminPage = await admin.newPage();
    expect((await adminPage.request.post(`/api/users/${userId}/scraps`, { data: { body: "   " } })).status()).toBe(400);
    await adminPage.goto(`/users/${userId}`);
    await adminPage.getByTestId("scrap-input").fill("Oi! Viu o episódio de hoje?");
    await adminPage.getByTestId("scrap-send").click();
    await expect(adminPage.getByTestId("profile-scraps")).toContainText("Oi! Viu o episódio de hoje?");
    await admin.close();

    const scrap = await prisma.scrap.findFirstOrThrow({ where: { profileId: userId, authorId: adminId } });
    await expect.poll(() => prisma.socialNotification.count({ where: { userId, actorId: adminId, type: "PROFILE_SCRAP" } })).toBe(1);
    const bell = await (await request.get("/api/notifications")).json();
    expect(JSON.stringify(bell)).toContain(`/users/${userId}#recados`);

    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("profile-scraps")).toContainText("recados (1)");
    await page.getByTestId(`scrap-delete-${scrap.id}`).click();
    await expect(page.getByTestId(`scrap-${scrap.id}`)).toHaveCount(0);
    expect((await prisma.scrap.findUniqueOrThrow({ where: { id: scrap.id } })).deletedAt).not.toBeNull();
  });

  test("depoimentos: só amigos escrevem; aparece depois da aprovação; reescrever volta para a aprovação", async ({ browser, page }) => {
    const admin = await browser.newContext({ storageState: adminState });
    const adminPage = await admin.newPage();
    await unfriend();
    expect((await adminPage.request.put(`/api/users/${userId}/testimonials`, { data: { body: "Companhia ótima." } })).status()).toBe(403);
    await befriend();

    await adminPage.goto(`/users/${userId}`);
    await adminPage.getByTestId("testimonial-input").fill("Melhor companhia de maratona.");
    await adminPage.getByTestId("testimonial-send").click();
    await expect(adminPage.getByTestId("testimonial-status")).toContainText("Esperando a aprovação");
    const t = await prisma.testimonial.findUniqueOrThrow({ where: { profileId_authorId: { profileId: userId, authorId: adminId } } });

    // Antes de aprovar, só a dona vê. Quem olha é uma terceira conta (sistema fechado: sem conta, o perfil nem abre).
    const outsiderToken = `t121${Date.now()}`.padEnd(64, "0");
    const outsider = await prisma.user.create({ data: { email: `terceira-${Date.now()}@spec121.test.local`, displayName: "Terceira 121", passwordHash: "x", passwordSalt: "x" } });
    await prisma.session.create({ data: { token: outsiderToken, userId: outsider.id, expiresAt: new Date(Date.now() + 3600_000) } });
    const anon = await browser.newContext({ storageState: { cookies: [{ ...adminState.cookies[0], value: outsiderToken }], origins: [] } });
    const anonPage = await anon.newPage();
    await anonPage.goto(`/users/${userId}`);
    await expect(anonPage.getByTestId("profile-testimonials")).toContainText("Nenhum depoimento ainda.");

    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("testimonials-pending")).toContainText("Melhor companhia de maratona.");
    await page.getByTestId(`testimonial-approve-${t.id}`).click();
    await expect(page.getByTestId("testimonials-pending")).toHaveCount(0);
    await expect(page.getByTestId("profile-testimonials")).toContainText("depoimentos (1)");

    await anonPage.reload();
    await expect(anonPage.getByTestId(`testimonial-${t.id}`)).toContainText("Melhor companhia de maratona.");
    await anon.close();
    await prisma.user.delete({ where: { id: outsider.id } });

    await adminPage.reload();
    await adminPage.getByTestId("testimonial-input").fill("Melhor companhia de maratona (e de filmes).");
    await adminPage.getByTestId("testimonial-send").click();
    await expect.poll(async () => (await prisma.testimonial.findUniqueOrThrow({ where: { id: t.id } })).status).toBe("PENDING");
    await admin.close();
  });

  test("fãs e avaliações: ser fã notifica; só amigos avaliam, de 0 a 3", async ({ browser, request }) => {
    expect((await request.patch(`/api/users/${userId}/fan`, { data: { fan: true } })).status()).toBe(400);
    const admin = await browser.newContext({ storageState: adminState });
    const adminPage = await admin.newPage();
    await adminPage.goto(`/users/${userId}`);
    await adminPage.getByTestId("profile-fan-toggle").click();
    await expect(adminPage.getByTestId("profile-fan-count")).toHaveText("1 fã");
    await expect.poll(() => prisma.socialNotification.count({ where: { userId, actorId: adminId, type: "PROFILE_FAN" } })).toBe(1);

    expect((await adminPage.request.put(`/api/users/${userId}/rating`, { data: { otaku: 4 } })).status()).toBe(400);
    await adminPage.getByTestId("rate-otaku-3").click();
    await expect(adminPage.getByTestId("profile-rating-otaku")).toHaveAttribute("data-value", "3");
    await expect(adminPage.getByTestId("profile-rating-votes")).toHaveText("Média de 1 amigo.");

    await unfriend();
    expect((await adminPage.request.put(`/api/users/${userId}/rating`, { data: { gentil: 2 } })).status()).toBe(403);
    await befriend();
    await admin.close();
  });

  test("bloqueio impede recado e esconde o que a pessoa bloqueada escreveu", async ({ browser, page, request }) => {
    const admin = await browser.newContext({ storageState: adminState });
    expect((await admin.request.post(`/api/users/${userId}/scraps`, { data: { body: "Antes do bloqueio" } })).status()).toBe(201);
    expect((await request.put(`/api/users/${adminId}/block`)).ok()).toBe(true);
    expect((await admin.request.post(`/api/users/${userId}/scraps`, { data: { body: "Depois do bloqueio" } })).status()).toBe(403);
    expect((await admin.request.patch(`/api/users/${userId}/fan`, { data: { fan: true } })).status()).toBe(403);
    await admin.close();
    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("profile-scraps")).not.toContainText("Antes do bloqueio");
    expect((await request.delete(`/api/users/${adminId}/block`)).ok()).toBe(true);
  });
});
