import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";
import { FORTUNES } from "../src/lib/dailyFortune";

// Perfil no formato do Orkut: menu, fãs e avaliações à esquerda; sorte do dia (só a dona), quem sou eu, recados e
// depoimentos no centro; amigos (seguir mútuo), comunidades e conquistas à direita. Recado: qualquer conta. Depoimento
// e avaliação: só amigos; o depoimento só aparece depois de aprovado. Bloqueio impede tudo isso.
const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};
const PROFILE_TYPES = ["PROFILE_SCRAP", "PROFILE_TESTIMONIAL", "PROFILE_FAN"];

test.describe.serial("Perfil no formato do Orkut", () => {
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
  }

  async function befriend() {
    for (const [a, b] of [[userId, adminId], [adminId, userId]]) {
      await prisma.follow.upsert({ where: { followerId_followingId: { followerId: a, followingId: b } }, create: { followerId: a, followingId: b }, update: {} });
    }
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
    await expect(page.getByTestId("profile-friends").getByRole("link").first()).toHaveAttribute("href", `/users/${adminId}`);
    await expect(page.getByTestId("profile-achievements").getByRole("link", { name: "ver conquistas" })).toHaveAttribute("href", "/conquistas");
    await expect(page.getByRole("link", { name: /Minha Lista privada/ })).toHaveAttribute("href", "/minha-lista");
    await page.screenshot({ path: test.info().outputPath("perfil-orkut.png"), fullPage: true });
  });

  test("sorte do dia só para a dona do perfil; quem não entrou vê o perfil e é convidado a entrar para o recado", async ({ browser }) => {
    const admin = await browser.newContext({ storageState: adminState });
    const adminPage = await admin.newPage();
    await adminPage.goto(`/users/${userId}`);
    await expect(adminPage.getByTestId("profile-about")).toContainText("Frieren");
    await expect(adminPage.getByTestId("profile-fortune")).toHaveCount(0);
    await admin.close();

    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anonPage = await anon.newPage();
    await anonPage.goto(`/users/${userId}`);
    await expect(anonPage.getByTestId("profile-scraps")).toContainText("para deixar um recado");
    await expect(anonPage.getByTestId("profile-fan-toggle")).toHaveCount(0);
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
    await prisma.follow.deleteMany({ where: { followerId: userId, followingId: adminId } });
    expect((await adminPage.request.put(`/api/users/${userId}/testimonials`, { data: { body: "Companhia ótima." } })).status()).toBe(403);
    await befriend();

    await adminPage.goto(`/users/${userId}`);
    await adminPage.getByTestId("testimonial-input").fill("Melhor companhia de maratona.");
    await adminPage.getByTestId("testimonial-send").click();
    await expect(adminPage.getByTestId("testimonial-status")).toContainText("Esperando a aprovação");
    const t = await prisma.testimonial.findUniqueOrThrow({ where: { profileId_authorId: { profileId: userId, authorId: adminId } } });

    // Antes de aprovar, só a dona vê.
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
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

    await prisma.follow.deleteMany({ where: { followerId: userId, followingId: adminId } });
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
