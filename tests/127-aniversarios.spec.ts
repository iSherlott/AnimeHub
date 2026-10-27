import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Aniversários (perfil estilo Orkut): só dia e mês, em Editar perfil; só amigos veem; aniversariantes de hoje e dos
// próximos dias na página Amigos e na lateral do Feed; e o aviso no sino (um por amigo por dia).
const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};
const ZONE = "America/Sao_Paulo";
const EMAIL = "aniversario-127@test.local";

/** Dia e mês daqui a `offset` dias no fuso das contas de teste. */
function dayIn(offset: number) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: ZONE, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const date = new Date(Date.UTC(get("year"), get("month") - 1, get("day") + offset));
  return { day: date.getUTCDate(), month: date.getUTCMonth() + 1 };
}

test.describe.serial("Aniversários", () => {
  let prisma: PrismaClient;
  let userId = "";
  let adminId = "";
  let otherId = "";

  const pair = (a: string, b: string) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    const soon = dayIn(3);
    otherId = (await prisma.user.create({ data: { email: EMAIL, passwordHash: "e2e-fixture-not-a-real-hash", passwordSalt: "e2e-fixture-not-a-real-salt", displayName: "Aniversariante 127", birthDay: soon.day, birthMonth: soon.month } })).id;
    const today = dayIn(0);
    await prisma.user.update({ where: { id: adminId }, data: { birthDay: today.day, birthMonth: today.month } });
    for (const other of [adminId, otherId]) await prisma.friendship.upsert({ where: { userAId_userBId: pair(userId, other) }, create: pair(userId, other), update: {} });
    await prisma.socialNotification.deleteMany({ where: { userId, type: "FRIEND_BIRTHDAY" } });
  });

  test.afterAll(async () => {
    await prisma.friendship.deleteMany({ where: pair(userId, adminId) });
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.socialNotification.deleteMany({ where: { userId, type: "FRIEND_BIRTHDAY" } });
    await prisma.user.updateMany({ where: { id: { in: [userId, adminId] } }, data: { birthDay: null, birthMonth: null, notifyFollowers: true } });
    await prisma.$disconnect();
  });

  test("Editar perfil: dia e mês; data impossível é recusada", async ({ page, request }) => {
    expect((await request.patch("/api/users/me", { data: { birthDay: 31, birthMonth: 4 } })).status()).toBe(400);
    expect((await request.patch("/api/users/me", { data: { birthDay: 10 } })).status()).toBe(400);
    await page.goto("/perfil/editar");
    await page.getByTestId("profile-birth-day").selectOption("14");
    await page.getByTestId("profile-birth-month").selectOption("3");
    await page.screenshot({ path: test.info().outputPath("aniversario-editor.png"), fullPage: true });
    await page.getByTestId("profile-edit-save").click();
    await expect(page).toHaveURL(new RegExp(`/users/${userId}$`));
    await expect.poll(async () => prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { birthDay: true, birthMonth: true } })).toEqual({ birthDay: 14, birthMonth: 3 });
    await expect(page.getByTestId("profile-about")).toContainText("Aniversário14 de março · só amigos veem");
  });

  test("só amigos veem a data", async ({ browser }) => {
    const admin = await browser.newContext({ storageState: adminState });
    const adminPage = await admin.newPage();
    await adminPage.goto(`/users/${userId}`);
    await expect(adminPage.getByTestId("profile-about")).toContainText("14 de março");
    await admin.close();
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const anonPage = await anon.newPage();
    await anonPage.goto(`/users/${userId}`);
    await expect(anonPage.getByTestId("profile-about")).not.toContainText("Aniversário");
    await anon.close();
  });

  test("aniversariantes na página Amigos e na lateral do Feed", async ({ page }) => {
    await page.goto("/amigos");
    const box = page.getByTestId("friend-birthdays");
    await expect(box.getByTestId(`birthday-${adminId}`)).toContainText("Hoje!");
    await expect(box.getByTestId(`birthday-scrap-${adminId}`)).toHaveAttribute("href", `/users/${adminId}#recados`);
    await expect(box.getByTestId(`birthday-${otherId}`)).toContainText("Em 3 dias");
    const order = await box.locator("li").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")));
    expect(order).toEqual([`birthday-${adminId}`, `birthday-${otherId}`]);

    await page.goto("/");
    await expect(page.getByTestId(`sidebar-birthday-${adminId}`)).toContainText("Hoje · deixe um recado");
    await expect(page.getByTestId(`sidebar-birthday-${otherId}`)).toContainText("Em 3 dias");
  });

  test("sino: um aviso por amigo por dia; a preferência desliga", async ({ request }) => {
    type Item = { type: string; href: string; actor: { id: string } };
    const first = ((await (await request.get("/api/notifications")).json()).social as Item[]).filter((n) => n.type === "FRIEND_BIRTHDAY");
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ actor: { id: adminId }, href: `/users/${adminId}#recados` });
    await request.get("/api/notifications");
    expect(await prisma.socialNotification.count({ where: { userId, type: "FRIEND_BIRTHDAY" } })).toBe(1);

    await prisma.socialNotification.deleteMany({ where: { userId, type: "FRIEND_BIRTHDAY" } });
    await prisma.user.update({ where: { id: userId }, data: { notifyFollowers: false } });
    await request.get("/api/notifications");
    expect(await prisma.socialNotification.count({ where: { userId, type: "FRIEND_BIRTHDAY" } })).toBe(0);
    await prisma.user.update({ where: { id: userId }, data: { notifyFollowers: true } });
  });
});
