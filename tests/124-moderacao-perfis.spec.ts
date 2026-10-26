import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Moderação dos perfis: denunciar recado e depoimento (motivo fixo e confirmação), a fila em Admin → Acesso e
// moderação (remover esconde o conteúdo e fecha todas as denúncias dele; manter fecha sem mexer), e as regras
// (não denunciar o próprio, só depoimento aprovado, motivo válido, uma denúncia aberta por pessoa).
const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Moderação dos perfis", () => {
  let prisma: PrismaClient;
  let userId = "";
  let adminId = "";
  let scrapId = "";
  let testimonialId = "";

  async function clean() {
    const pair = [userId, adminId];
    await prisma.profileReport.deleteMany({ where: { reporterId: { in: pair } } });
    await prisma.scrap.deleteMany({ where: { profileId: { in: pair }, authorId: { in: pair } } });
    await prisma.testimonial.deleteMany({ where: { profileId: { in: pair }, authorId: { in: pair } } });
    await prisma.friendship.deleteMany({ where: { userAId: { in: pair }, userBId: { in: pair } } });
    await prisma.socialNotification.deleteMany({ where: { userId: { in: pair }, type: { in: ["PROFILE_SCRAP", "PROFILE_TESTIMONIAL"] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    await clean();
    scrapId = (await prisma.scrap.create({ data: { profileId: userId, authorId: adminId, body: "Recado ofensivo de teste 124" } })).id;
    testimonialId = (await prisma.testimonial.create({ data: { profileId: userId, authorId: adminId, body: "Depoimento de teste 124", status: "PENDING" } })).id;
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("denunciar recado pela tela: motivo, confirmação e retorno discreto", async ({ page, request }) => {
    expect((await request.post(`/api/scraps/${scrapId}/report`, { data: { reason: "PALAVRAO" } })).status()).toBe(400);
    await page.goto(`/users/${userId}`);
    await page.getByTestId(`report-scrap-${scrapId}`).click();
    await expect(page.getByTestId("report-continue")).toBeDisabled();
    await page.getByLabel("Assédio ou discurso de ódio").check();
    await page.getByTestId("report-continue").click();
    await page.getByTestId("report-send").click();
    await expect(page.getByTestId(`reported-scrap-${scrapId}`)).toHaveText("Denunciado");
    const rows = await prisma.profileReport.findMany({ where: { scrapId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reporterId: userId, reason: "HARASSMENT", resolvedAt: null });

    // Repetir não duplica a denúncia aberta.
    expect((await request.post(`/api/scraps/${scrapId}/report`, { data: { reason: "SPAM" } })).status()).toBe(201);
    expect(await prisma.profileReport.count({ where: { scrapId } })).toBe(1);
  });

  test("regras: quem escreveu não denuncia; depoimento só depois de aprovado", async ({ browser, request }) => {
    const admin = await browser.newContext({ storageState: adminState });
    expect((await admin.request.post(`/api/scraps/${scrapId}/report`, { data: { reason: "SPAM" } })).status()).toBe(400);
    expect((await request.post(`/api/testimonials/${testimonialId}/report`, { data: { reason: "SPAM" } })).status()).toBe(404);
    await prisma.testimonial.update({ where: { id: testimonialId }, data: { status: "APPROVED", decidedAt: new Date() } });
    expect((await request.post(`/api/testimonials/${testimonialId}/report`, { data: { reason: "UNMARKED_SPOILER" } })).status()).toBe(201);
    await admin.close();
    // Quem não é da moderação não vê a fila.
    expect((await request.get("/api/admin/profile-reports")).status()).toBe(403);
  });

  test("fila no admin: remover o recado fecha todas as denúncias dele; manter o depoimento só fecha", async ({ browser }) => {
    // Uma segunda denúncia do mesmo recado (outra pessoa), para conferir que remover fecha as duas.
    await prisma.profileReport.create({ data: { reporterId: adminId, scrapId, reason: "SPAM" } });
    const admin = await browser.newContext({ storageState: adminState });
    const page = await admin.newPage();
    await page.goto("/admin/acesso");
    const panel = page.getByTestId("admin-profile-reports");
    await expect(panel).toContainText("Denúncias dos perfis (3)");
    await expect(panel).toContainText("Recado ofensivo de teste 124");
    await expect(panel).toContainText("Motivo: Assédio ou discurso de ódio");

    const first = await prisma.profileReport.findFirstOrThrow({ where: { scrapId, reporterId: userId } });
    await page.getByTestId(`profile-report-remove-${first.id}`).click();
    await expect(panel).toContainText("Denúncias dos perfis (1)");
    expect((await prisma.scrap.findUniqueOrThrow({ where: { id: scrapId } })).deletedAt).not.toBeNull();
    expect(await prisma.profileReport.count({ where: { scrapId, resolvedAt: null } })).toBe(0);
    expect(await prisma.profileReport.count({ where: { scrapId, action: "REMOVED", resolvedById: adminId } })).toBe(2);

    const t = await prisma.profileReport.findFirstOrThrow({ where: { testimonialId } });
    await page.getByTestId(`profile-report-keep-${t.id}`).click();
    await expect(page.getByTestId("profile-reports-empty")).toBeVisible();
    expect((await prisma.testimonial.findUniqueOrThrow({ where: { id: testimonialId } })).status).toBe("APPROVED");
    expect((await prisma.profileReport.findUniqueOrThrow({ where: { id: t.id } })).action).toBe("KEPT");
    await admin.close();
  });

  test("depoimento removido pela moderação some do perfil", async ({ browser, page }) => {
    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId(`testimonial-${testimonialId}`)).toBeVisible();
    await expect(page.getByTestId("profile-scraps")).not.toContainText("Recado ofensivo de teste 124");

    const report = await prisma.profileReport.create({ data: { reporterId: userId, testimonialId, reason: "HARASSMENT" } });
    const admin = await browser.newContext({ storageState: adminState });
    expect((await admin.request.post(`/api/admin/profile-reports/${report.id}`, { data: { action: "remove" } })).status()).toBe(200);
    expect((await admin.request.post(`/api/admin/profile-reports/${report.id}`, { data: { action: "keep" } })).status()).toBe(409);
    await admin.close();
    await page.reload();
    await expect(page.getByTestId(`testimonial-${testimonialId}`)).toHaveCount(0);
    expect((await prisma.testimonial.findUniqueOrThrow({ where: { id: testimonialId } })).status).toBe("REMOVED");
  });
});
