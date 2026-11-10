import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Pedido de 10/11: quando um serviço ou job falha (ou para de rodar), quem administra fica sabendo pelo sino, na aba
// Sistema, sem precisar abrir o painel. Membro comum não vê nada disso.
const adminHeaders = { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` };
const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};
const SOURCE = "notifier";
const MARK = "falha de teste 146";

test.describe.serial("Avisos do sistema no sino do admin", () => {
  let prisma: PrismaClient;
  let adminId = "";

  async function clean() {
    await prisma.ingestionRun.deleteMany({ where: { OR: [{ message: { contains: MARK } }, { source: SOURCE }] } });
    await prisma.systemAlert.deleteMany({});
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    await clean();
    const now = Date.now();
    // Uma execução com erro, e o notifier parado há 2 h (rodava antes).
    await prisma.ingestionRun.create({ data: { source: "calendar-loader", startedAt: new Date(now - 10 * 60_000), finishedAt: new Date(now - 9 * 60_000), status: "ERROR", itemsFailed: 3, message: `AniList fora do ar (${MARK})` } });
    await prisma.ingestionRun.create({ data: { source: SOURCE, startedAt: new Date(now - 2 * 3600_000), finishedAt: new Date(now - 2 * 3600_000), status: "OK", itemsProcessed: 4, message: MARK } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("o admin recebe um aviso por problema, sem repetir", async ({ request }) => {
    const first = await (await request.get("/api/notifications", { headers: adminHeaders })).json();
    const titles = (first.system as { title: string }[]).map((s) => s.title);
    expect(titles).toContain("Calendário (calendar-loader) falhou");
    expect(titles).toContain("Avisos de lançamento (notifier) parou de rodar");
    const failed = (first.system as { title: string; message: string; href: string }[]).find((s) => s.title.endsWith("falhou"));
    expect(failed?.message).toContain(MARK);
    expect(failed?.href).toBe("/admin/jobs");
    // Outras specs da suíte também deixam jobs com falha: aqui só contam os dois problemas desta.
    const ours = (list: { title: string }[]) => list.filter((s) => s.title === "Calendário (calendar-loader) falhou" || s.title.includes("(notifier) parou"));
    expect(ours(first.system)).toHaveLength(2);
    expect(first.systemUnreadCount).toBe(first.system.length);
    const second = await (await request.get("/api/notifications", { headers: adminHeaders })).json();
    expect(ours(second.system)).toHaveLength(2);
  });

  test("membro comum não recebe avisos do sistema nem consegue marcá-los", async ({ request }) => {
    const mine = await (await request.get("/api/notifications")).json();
    expect(mine.system).toBeUndefined();
    const alert = await prisma.systemAlert.findFirstOrThrow();
    expect((await request.post(`/api/notifications/system/${alert.id}/read`)).status()).toBe(403);
  });

  test("a aba Sistema aparece só para o admin; abrir o aviso marca como lido só para ele", async ({ browser }) => {
    const context = await browser.newContext({ storageState: adminState, baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    const total = await prisma.systemAlert.count();
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Notificações" }).click();
    const tab = page.getByTestId("bell-tab-system");
    await expect(tab).toHaveText(`Sistema · ${total}`);
    await tab.click();
    const more = page.getByTestId("bell-more");
    if (await more.count()) await more.click();
    await page.getByTestId("bell-system-item").filter({ hasText: "(notifier) parou de rodar" }).click();
    await expect.poll(async () => (await prisma.systemAlert.findFirstOrThrow({ where: { title: { contains: "parou de rodar" } } })).readBy).toEqual([adminId]);
    await context.close();
  });

  test("\"Marcar todas como lidas\" vale também para a aba Sistema", async ({ request }) => {
    await request.post("/api/notifications/read-all", { headers: adminHeaders });
    const after = await (await request.get("/api/notifications", { headers: adminHeaders })).json();
    expect(after.systemUnreadCount).toBe(0);
  });
});
