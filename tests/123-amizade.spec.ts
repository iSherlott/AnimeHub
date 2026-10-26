import { readFileSync } from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Amizade separada do seguir (como no Orkut): pedir, aceitar, recusar, cancelar e desfazer; o pedido das duas pessoas
// vira amizade; bloqueio desfaz; avisos no sino; seguir não muda nada. A migração transforma o seguir mútuo em amizade.
const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};
const FRIEND_TYPES = ["FRIEND_REQUEST", "FRIEND_ACCEPTED"];

test.describe.serial("Amizade separada do seguir", () => {
  let prisma: PrismaClient;
  let userId = "";
  let adminId = "";
  let followsBefore: Array<{ followerId: string; followingId: string }> = [];

  const pairWhere = () => ({ userAId: { in: [userId, adminId] }, userBId: { in: [userId, adminId] } });
  const friends = () => prisma.friendship.count({ where: pairWhere() });

  async function clean() {
    await prisma.friendship.deleteMany({ where: pairWhere() });
    await prisma.friendRequest.deleteMany({ where: { fromId: { in: [userId, adminId] }, toId: { in: [userId, adminId] } } });
    await prisma.socialNotification.deleteMany({ where: { userId: { in: [userId, adminId] }, type: { in: FRIEND_TYPES } } });
    await prisma.block.deleteMany({ where: { blockerId: { in: [userId, adminId] }, blockedId: { in: [userId, adminId] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    followsBefore = await prisma.follow.findMany({ where: { followerId: { in: [userId, adminId] }, followingId: { in: [userId, adminId] } }, select: { followerId: true, followingId: true } });
    await prisma.follow.deleteMany({ where: { followerId: { in: [userId, adminId] }, followingId: { in: [userId, adminId] } } });
    await clean();
  });

  test.afterAll(async () => {
    await clean();
    await prisma.follow.deleteMany({ where: { followerId: { in: [userId, adminId] }, followingId: { in: [userId, adminId] } } });
    if (followsBefore.length) await prisma.follow.createMany({ data: followsBefore, skipDuplicates: true });
    await prisma.$disconnect();
  });

  test("pedir pelo perfil, aceitar em Amigos; avisos no sino; seguir não muda", async ({ browser, page, request }) => {
    expect((await request.put(`/api/users/${userId}/friend`)).status()).toBe(400);

    await page.goto(`/users/${adminId}`);
    await page.getByTestId("friend-add").click();
    await expect(page.getByTestId("friend-cancel")).toBeVisible();
    expect(await prisma.friendRequest.count({ where: { fromId: userId, toId: adminId } })).toBe(1);

    const admin = await browser.newContext({ storageState: adminState });
    const bell = ((await (await admin.request.get("/api/notifications")).json()).social as Array<{ type: string; href: string }>).find((n) => n.type === "FRIEND_REQUEST");
    expect(bell?.href).toBe("/amigos");
    const adminPage = await admin.newPage();
    await adminPage.goto(`/users/${adminId}`);
    await expect(adminPage.getByTestId("profile-friend-requests")).toContainText("1 pedido de amizade esperando");
    await adminPage.getByTestId("profile-friend-requests").click();
    await expect(adminPage).toHaveURL(/\/amigos$/);
    await adminPage.getByTestId(`friend-request-${userId}`).getByTestId("friend-accept").click();
    await expect(adminPage.getByTestId("my-friends")).toContainText("E2E Test User");
    await admin.close();

    expect(await friends()).toBe(1);
    expect(await prisma.friendRequest.count({ where: { fromId: { in: [userId, adminId] }, toId: { in: [userId, adminId] } } })).toBe(0);
    await expect.poll(() => prisma.socialNotification.count({ where: { userId, actorId: adminId, type: "FRIEND_ACCEPTED" } })).toBe(1);
    // Seguir continua separado: ninguém passou a seguir ninguém.
    expect(await prisma.follow.count({ where: { followerId: { in: [userId, adminId] }, followingId: { in: [userId, adminId] } } })).toBe(0);

    await page.reload();
    await expect(page.getByTestId("friend-state")).toHaveText("✓ Vocês são amigos");
    await expect(page.getByTestId("testimonial-form")).toBeVisible();
    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("profile-friends")).toContainText("amigos (1)");
  });

  test("desfazer amizade tira o depoimento e a avaliação", async ({ page, request }) => {
    page.on("dialog", (d) => void d.accept());
    await page.goto(`/users/${adminId}`);
    await page.getByTestId("friend-remove").click();
    await expect(page.getByTestId("friend-add")).toBeVisible();
    expect(await friends()).toBe(0);
    expect((await request.put(`/api/users/${adminId}/testimonials`, { data: { body: "Oi." } })).status()).toBe(403);
    expect((await request.put(`/api/users/${adminId}/rating`, { data: { otaku: 3 } })).status()).toBe(403);
  });

  test("pedido das duas pessoas vira amizade; recusar e cancelar só apagam o pedido", async ({ browser, request }) => {
    const admin = await browser.newContext({ storageState: adminState });
    expect(await (await admin.request.put(`/api/users/${userId}/friend`)).json()).toEqual({ state: "sent" });
    expect(await (await request.put(`/api/users/${adminId}/friend`)).json()).toEqual({ state: "friends" });
    expect(await friends()).toBe(1);
    expect((await request.put(`/api/users/${adminId}/friend`)).status()).toBe(409);

    // Recusar.
    await request.delete(`/api/users/${adminId}/friend`);
    await admin.request.put(`/api/users/${userId}/friend`);
    expect(await (await request.delete(`/api/users/${adminId}/friend`)).json()).toEqual({ state: "none" });
    expect(await prisma.friendRequest.count({ where: { fromId: adminId, toId: userId } })).toBe(0);
    expect(await friends()).toBe(0);

    // Cancelar o próprio pedido.
    await request.put(`/api/users/${adminId}/friend`);
    expect(await (await request.delete(`/api/users/${adminId}/friend`)).json()).toEqual({ state: "none" });
    expect(await prisma.friendRequest.count({ where: { fromId: userId, toId: adminId } })).toBe(0);
    await admin.close();
  });

  test("bloqueio desfaz a amizade e impede pedidos", async ({ browser, request }) => {
    const admin = await browser.newContext({ storageState: adminState });
    await request.put(`/api/users/${adminId}/friend`);
    await admin.request.put(`/api/users/${userId}/friend`);
    expect(await friends()).toBe(1);
    expect((await request.put(`/api/users/${adminId}/block`)).ok()).toBe(true);
    expect(await friends()).toBe(0);
    expect((await admin.request.put(`/api/users/${userId}/friend`)).status()).toBe(404);
    expect((await request.delete(`/api/users/${adminId}/block`)).ok()).toBe(true);
    await admin.close();
  });

  test("menu da conta leva a Amigos", async ({ page }) => {
    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Menu da conta" }).click();
    await page.getByRole("menuitem", { name: "Amigos" }).click();
    await expect(page).toHaveURL(/\/amigos$/);
    await expect(page.getByTestId("friend-requests-received")).toBeVisible();
  });

  test("a migração transforma o seguir mútuo em amizade (só o mútuo)", async () => {
    const sql = readFileSync(path.join(process.cwd(), "prisma/migrations/20261110100000_friendships/migration.sql"), "utf8");
    const backfill = sql.slice(sql.indexOf('INSERT INTO "Friendship"'));
    const ROLLBACK = new Error("rollback");
    await prisma
      .$transaction(async (tx) => {
        await tx.follow.createMany({ data: [{ followerId: userId, followingId: adminId }, { followerId: adminId, followingId: userId }] });
        await tx.$executeRawUnsafe(backfill);
        const pair = userId < adminId ? { userAId: userId, userBId: adminId } : { userAId: adminId, userBId: userId };
        expect(await tx.friendship.findUnique({ where: { userAId_userBId: pair } })).not.toBeNull();
        // Só um registro por par, mesmo rodando de novo.
        await tx.$executeRawUnsafe(backfill);
        expect(await tx.friendship.count({ where: { userAId: { in: [userId, adminId] }, userBId: { in: [userId, adminId] } } })).toBe(1);
        // Seguir de um lado só não vira amizade.
        await tx.friendship.deleteMany({ where: pair });
        await tx.follow.deleteMany({ where: { followerId: adminId, followingId: userId } });
        await tx.$executeRawUnsafe(backfill);
        expect(await tx.friendship.count({ where: pair })).toBe(0);
        throw ROLLBACK;
      })
      .catch((e) => {
        if (e !== ROLLBACK) throw e;
      });
  });
});
