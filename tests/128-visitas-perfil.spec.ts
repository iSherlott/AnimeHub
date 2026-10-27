import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Visitas ao perfil: registra a última visita de quem tem conta; só a dona do perfil vê; quem desliga o
// registro some da lista de todos (até das visitas antigas) e também não vê quem o visitou; bloqueio não registra.
const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Visitas ao perfil", () => {
  let prisma: PrismaClient;
  let userId = "";
  let adminId = "";

  async function clean() {
    await prisma.profileVisit.deleteMany({ where: { profileId: { in: [userId, adminId] } } });
    await prisma.block.deleteMany({ where: { blockerId: { in: [userId, adminId] }, blockedId: { in: [userId, adminId] } } });
    await prisma.user.updateMany({ where: { id: { in: [userId, adminId] } }, data: { recordVisits: true } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    await clean();
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("a visita de quem tem conta aparece só para a dona do perfil", async ({ browser, page }) => {
    const admin = await browser.newContext({ storageState: adminState });
    const adminPage = await admin.newPage();
    await adminPage.goto(`/users/${userId}`);
    await expect(adminPage.getByTestId("profile-visitors")).toHaveCount(0);
    await admin.close();

    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    await (await anon.newPage()).goto(`/users/${userId}`);
    await anon.close();

    await page.goto(`/users/${userId}`);
    const box = page.getByTestId("profile-visitors");
    await expect(box).toContainText("visitas recentes (1)");
    await expect(box.getByTestId(`visitor-${adminId}`)).toContainText("E2E Admin");
    // A própria visita e a de quem não entrou não contam.
    expect(await prisma.profileVisit.count({ where: { profileId: userId } })).toBe(1);

    await page.goto(`/users/${userId}/visitas`);
    await expect(page.getByTestId(`visit-${adminId}`)).toContainText("visitou");
    // A página de visitas é só da dona.
    const other = await page.goto(`/users/${adminId}/visitas`);
    expect(other?.status()).toBe(404);
  });

  test("desligar o registro: some das visitas dos outros e deixa de ver as próprias", async ({ browser, page }) => {
    const admin = await browser.newContext({ storageState: adminState });
    const adminPage = await admin.newPage();
    await adminPage.goto("/configuracoes");
    await adminPage.getByRole("checkbox", { name: "Registrar minhas visitas aos perfis" }).uncheck();
    await adminPage.getByTestId("save-settings").click();
    await expect(adminPage.getByRole("status")).toContainText("Configurações salvas");
    expect((await prisma.user.findUniqueOrThrow({ where: { id: adminId } })).recordVisits).toBe(false);

    // A visita antiga do admin some da lista; uma visita nova não é registrada.
    const before = (await prisma.profileVisit.findUniqueOrThrow({ where: { profileId_visitorId: { profileId: userId, visitorId: adminId } } })).visitedAt;
    await adminPage.goto(`/users/${userId}`);
    expect((await prisma.profileVisit.findUniqueOrThrow({ where: { profileId_visitorId: { profileId: userId, visitorId: adminId } } })).visitedAt).toEqual(before);
    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("profile-visitors")).toContainText("Ninguém visitou seu perfil");

    // E o admin não vê quem visitou o perfil dele.
    await page.goto(`/users/${adminId}`);
    await adminPage.goto(`/users/${adminId}`);
    await expect(adminPage.getByTestId("profile-visitors")).toContainText("Você desligou o registro de visitas");
    await admin.close();
    await prisma.user.update({ where: { id: adminId }, data: { recordVisits: true } });
  });

  test("bloqueio: não registra e esconde a visita", async ({ browser, page, request }) => {
    await prisma.profileVisit.deleteMany({ where: { profileId: userId } });
    expect((await request.put(`/api/users/${adminId}/block`)).ok()).toBe(true);
    const admin = await browser.newContext({ storageState: adminState });
    await (await admin.newPage()).goto(`/users/${userId}`);
    await admin.close();
    expect(await prisma.profileVisit.count({ where: { profileId: userId, visitorId: adminId } })).toBe(0);
    // Uma visita gravada antes do bloqueio também não aparece.
    await prisma.profileVisit.create({ data: { profileId: userId, visitorId: adminId } });
    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId(`visitor-${adminId}`)).toHaveCount(0);
    expect((await request.delete(`/api/users/${adminId}/block`)).ok()).toBe(true);
  });
});
