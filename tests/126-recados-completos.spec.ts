import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Recados mais completos: responder um recado recebido (a resposta vai para o perfil de quem escreveu), a conversa
// entre duas pessoas (os dois sentidos, em ordem) e a lista de fãs.
const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Recados mais completos", () => {
  let prisma: PrismaClient;
  let userId = "";
  let adminId = "";
  let originalId = "";

  async function clean() {
    const pair = [userId, adminId];
    await prisma.scrap.deleteMany({ where: { profileId: { in: pair }, authorId: { in: pair } } });
    await prisma.fan.deleteMany({ where: { fanId: { in: pair }, targetId: { in: pair } } });
    await prisma.block.deleteMany({ where: { blockerId: { in: pair }, blockedId: { in: pair } } });
    await prisma.socialNotification.deleteMany({ where: { userId: { in: pair }, type: { in: ["PROFILE_SCRAP", "PROFILE_FAN"] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    await clean();
    originalId = (await prisma.scrap.create({ data: { profileId: userId, authorId: adminId, body: "Primeiro recado 126", createdAt: new Date(Date.now() - 60_000) } })).id;
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("responder um recado recebido: a resposta vai para o perfil de quem escreveu", async ({ page }) => {
    await page.goto(`/users/${userId}`);
    await page.getByTestId(`scrap-reply-${originalId}`).click();
    await page.getByTestId("scrap-reply-input").fill("Resposta 126");
    await page.getByTestId("scrap-reply-send").click();
    await expect(page.getByTestId(`scrap-replied-${originalId}`)).toHaveText("Resposta enviada");
    const reply = await prisma.scrap.findFirstOrThrow({ where: { body: "Resposta 126" } });
    expect(reply).toMatchObject({ profileId: adminId, authorId: userId, replyToId: originalId });
    await expect.poll(() => prisma.socialNotification.count({ where: { userId: adminId, actorId: userId, type: "PROFILE_SCRAP" } })).toBe(1);
  });

  test("só responde quem recebeu, e só para quem escreveu", async ({ request }) => {
    const mine = await prisma.scrap.findFirstOrThrow({ where: { body: "Resposta 126" } });
    // O recado que eu escrevi no perfil do admin não é "recebido" por mim.
    expect((await request.post(`/api/users/${adminId}/scraps`, { data: { body: "x", replyToId: mine.id } })).status()).toBe(400);
    expect((await request.post(`/api/users/${adminId}/scraps`, { data: { body: "x", replyToId: "nao-existe" } })).status()).toBe(400);
  });

  test("conversa: os dois sentidos em ordem; quem é da conversa escreve dali; visitante vai ao login", async ({ page, browser }) => {
    await page.goto(`/users/${userId}`);
    await page.getByTestId(`scrap-thread-${originalId}`).click();
    await expect(page).toHaveURL(new RegExp(`/users/${userId}/recados/com/${adminId}$`));
    const convo = page.getByTestId("scrap-conversation");
    await expect(convo).toContainText("conversa (2)");
    const texts = await convo.locator("li").allInnerTexts();
    expect(texts[0]).toContain("Primeiro recado 126");
    expect(texts[0]).toContain("no perfil de E2E Test User");
    expect(texts[1]).toContain("Resposta 126");
    expect(texts[1]).toContain("no perfil de E2E Admin");
    expect(texts[1]).toContain("↩ resposta a um recado");

    await convo.getByTestId("scrap-input").fill("Mais um 126");
    await convo.getByTestId("scrap-send").click();
    await expect(convo).toContainText("conversa (3)");
    expect(await prisma.scrap.count({ where: { profileId: adminId, authorId: userId, body: "Mais um 126" } })).toBe(1);
    await page.screenshot({ path: test.info().outputPath("conversa.png"), fullPage: true });

    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anonPage = await anon.newPage();
    // Sistema fechado: recados são só de quem tem conta.
    await anonPage.goto(`/users/${userId}/recados/com/${adminId}`);
    await expect(anonPage).toHaveURL(`/login?next=${encodeURIComponent(`/users/${userId}/recados/com/${adminId}`)}`);
    await anon.close();
  });

  test("bloqueio esconde a conversa", async ({ page, request }) => {
    expect((await request.put(`/api/users/${adminId}/block`)).ok()).toBe(true);
    const res = await page.goto(`/users/${userId}/recados/com/${adminId}`);
    expect(res?.status()).toBe(404);
    expect((await request.delete(`/api/users/${adminId}/block`)).ok()).toBe(true);
  });

  test("lista de fãs", async ({ browser, page }) => {
    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("profile-fans").getByRole("link", { name: "ver fãs" })).toHaveCount(0);
    const admin = await browser.newContext({ storageState: adminState });
    expect((await admin.request.patch(`/api/users/${userId}/fan`, { data: { fan: true } })).ok()).toBe(true);
    await admin.close();
    await page.reload();
    await page.getByTestId("profile-fans").getByRole("link", { name: "ver fãs" }).click();
    await expect(page).toHaveURL(new RegExp(`/users/${userId}/fas$`));
    await expect(page.getByTestId("fans-page")).toContainText("E2E Admin");
    await expect(page.getByRole("heading", { name: "Meus fãs" })).toBeVisible();
  });
});
