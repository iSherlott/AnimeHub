import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Falhas de lógica achadas na auditoria de 27/10 (relatório em docs/auditoria/auditoria-regras-e-paginas.md):
// 1) o bloqueio da dona do perfil vale para todos os visitantes (recados, depoimentos, fãs, avaliações);
// 2) avaliação de ex-amigo sai da média; 3) contagem de fãs igual à da lista;
// 4) pedido de amizade reenviado e depoimento reescrito voltam a avisar depois de lidos (sem repetir enquanto não lidos);
// 5) quem saiu da comunidade não recebe mais os avisos dela; 6) a mesma obra entra uma vez só no álbum.
const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};
const EMAIL = "terceira-131@test.local";
const S1 = 131001;

test.describe.serial("Auditoria: regras sociais", () => {
  let prisma: PrismaClient;
  let userId = "";
  let adminId = "";
  let thirdId = "";

  const pair = (a: string, b: string) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });

  async function clean() {
    const people = [userId, adminId, thirdId].filter(Boolean);
    await prisma.scrap.deleteMany({ where: { profileId: { in: people }, authorId: { in: people } } });
    await prisma.testimonial.deleteMany({ where: { profileId: { in: people }, authorId: { in: people } } });
    await prisma.fan.deleteMany({ where: { targetId: { in: people } } });
    await prisma.profileRating.deleteMany({ where: { targetId: { in: people } } });
    await prisma.friendship.deleteMany({ where: { userAId: { in: people }, userBId: { in: people } } });
    await prisma.friendRequest.deleteMany({ where: { fromId: { in: people } } });
    await prisma.block.deleteMany({ where: { blockerId: { in: people } } });
    await prisma.socialNotification.deleteMany({ where: { userId: { in: people } } });
    await prisma.profileAlbum.deleteMany({ where: { userId } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: [S1 + 10, S1 + 11] } } });
    await prisma.community.deleteMany({ where: { franchiseKey: S1 } });
    await deleteCatalogEntries(prisma, { where: { anilistId: S1 } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    thirdId = (await prisma.user.create({ data: { email: EMAIL, passwordHash: "e2e-fixture-not-a-real-hash", passwordSalt: "e2e-fixture-not-a-real-salt", displayName: "Terceira 131" } })).id;
    await clean();
  });

  test.afterAll(async () => {
    await clean();
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
  });

  test("bloqueio da dona do perfil esconde, para todos, o que a pessoa bloqueada deixou no perfil", async ({ browser }) => {
    // A Terceira deixa recado, depoimento aprovado, vira fã e avalia o perfil do usuário; depois o usuário a bloqueia.
    await prisma.friendship.create({ data: pair(userId, thirdId) });
    await prisma.scrap.create({ data: { profileId: userId, authorId: thirdId, body: "Recado da Terceira 131" } });
    await prisma.testimonial.create({ data: { profileId: userId, authorId: thirdId, body: "Depoimento da Terceira 131", status: "APPROVED" } });
    await prisma.fan.create({ data: { fanId: thirdId, targetId: userId } });
    await prisma.profileRating.create({ data: { raterId: thirdId, targetId: userId, otaku: 3, gentil: 3, semSpoiler: 3 } });
    await prisma.block.create({ data: { blockerId: userId, blockedId: thirdId } });
    await prisma.friendship.deleteMany({ where: pair(userId, thirdId) });

    // Quem vê é o admin, que não tem bloqueio com ninguém.
    const admin = await browser.newContext({ storageState: adminState });
    const page = await admin.newPage();
    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("profile-scraps")).not.toContainText("Recado da Terceira 131");
    await expect(page.getByTestId("profile-testimonials")).not.toContainText("Depoimento da Terceira 131");
    await expect(page.getByTestId("profile-fan-count")).toHaveText("0 fãs");
    await expect(page.getByTestId("profile-rating-votes")).toHaveText("Ninguém avaliou ainda.");
    await page.goto(`/users/${userId}/fas`);
    await expect(page.getByTestId("fans-page")).not.toContainText("Terceira 131");
    await admin.close();
    await prisma.block.deleteMany({ where: { blockerId: userId } });
  });

  test("avaliação de quem deixou de ser amigo sai da média", async ({ request }) => {
    await prisma.profileRating.deleteMany({ where: { targetId: userId } });
    await prisma.friendship.create({ data: pair(userId, adminId) });
    await prisma.profileRating.create({ data: { raterId: adminId, targetId: userId, otaku: 3, gentil: 1, semSpoiler: 2 } });
    const page1 = await request.get(`/users/${userId}`);
    expect(await page1.text()).toContain("Média de 1 amigo.");
    await prisma.friendship.deleteMany({ where: pair(userId, adminId) });
    const page2 = await request.get(`/users/${userId}`);
    expect(await page2.text()).toContain("Ninguém avaliou ainda.");
    expect(await prisma.profileRating.count({ where: { raterId: adminId, targetId: userId } })).toBe(1);
  });

  test("pedido de amizade reenviado e depoimento reescrito voltam a avisar depois de lidos", async ({ browser, request }) => {
    const admin = await browser.newContext({ storageState: adminState });
    const count = (type: string) => prisma.socialNotification.count({ where: { userId, actorId: adminId, type } });

    expect((await admin.request.put(`/api/users/${userId}/friend`)).ok()).toBe(true);
    expect(await count("FRIEND_REQUEST")).toBe(1);
    await request.delete(`/api/users/${adminId}/friend`); // recusa
    await admin.request.put(`/api/users/${userId}/friend`); // reenvia sem o primeiro aviso ter sido lido
    expect(await count("FRIEND_REQUEST")).toBe(1);
    await prisma.socialNotification.updateMany({ where: { userId, type: "FRIEND_REQUEST" }, data: { readAt: new Date() } });
    await request.delete(`/api/users/${adminId}/friend`);
    await admin.request.put(`/api/users/${userId}/friend`); // reenvia depois de lido: avisa de novo
    expect(await count("FRIEND_REQUEST")).toBe(2);

    // Depoimento: aceitar a amizade e reescrever três vezes sem ler gera um aviso só.
    await request.put(`/api/users/${adminId}/friend`);
    for (const body of ["Um", "Dois", "Três"]) expect((await admin.request.put(`/api/users/${userId}/testimonials`, { data: { body } })).ok()).toBe(true);
    expect(await count("PROFILE_TESTIMONIAL")).toBe(1);
    // Removido pela moderação: não volta reescrito.
    await prisma.testimonial.update({ where: { profileId_authorId: { profileId: userId, authorId: adminId } }, data: { status: "REMOVED" } });
    expect((await admin.request.put(`/api/users/${userId}/testimonials`, { data: { body: "De novo" } })).status()).toBe(403);
    await admin.close();
    await prisma.friendship.deleteMany({ where: pair(userId, adminId) });
  });

  test("quem sai da comunidade não recebe mais os avisos dela", async ({ browser, request }) => {
    await prisma.catalogEntry.create({ data: { source: "anilist", onPlatform: true, kind: "EPISODE", status: "FINISHED", format: "TV", anilistId: S1, franchiseKey: S1, titleRomaji: "Auditoria 131", seasonYear: 2020, timelineOrder: 1 } });
    expect((await request.post(`/api/communities/${S1}/membership`)).status()).toBe(200);
    const topicId = (await (await request.post(`/api/communities/${S1}/topics`, { data: { title: "Tópico 131", body: "x" } })).json()).topicId as string;
    const admin = await browser.newContext({ storageState: adminState });
    await admin.request.post(`/api/communities/${S1}/membership`);
    await admin.request.post(`/api/communities/topics/${topicId}/replies`, { data: { body: "um" } });
    expect(await prisma.socialNotification.count({ where: { userId, type: "COMMUNITY_REPLY" } })).toBe(1);

    await prisma.socialNotification.deleteMany({ where: { userId, type: { startsWith: "COMMUNITY_" } } });
    expect((await request.delete(`/api/communities/${S1}/membership`)).status()).toBe(200);
    await admin.request.post(`/api/communities/topics/${topicId}/replies`, { data: { body: "dois" } });
    await admin.request.post(`/api/communities/${S1}/events`, { data: { title: "Evento 131", description: "x", startsAt: "2031-01-01T20:00:00Z" } });
    expect(await prisma.socialNotification.count({ where: { userId, type: { startsWith: "COMMUNITY_" } } })).toBe(0);
    await admin.close();
  });

  test("a mesma obra (outra temporada) não entra duas vezes no álbum", async ({ request }) => {
    const s1 = await prisma.anime.create({ data: { userId, anilistId: S1 + 10, titleRomaji: "Obra 131", genres: "", seriesKey: "obra 131", seasonNumber: 1 } });
    const s2 = await prisma.anime.create({ data: { userId, anilistId: S1 + 11, titleRomaji: "Obra 131 Season 2", genres: "", seriesKey: "obra 131", seasonNumber: 2 } });
    const albumId = (await (await request.post("/api/albums", { data: { name: "Auditoria 131" } })).json()).id as string;
    expect((await request.put(`/api/albums/${albumId}/items`, { data: { animeId: s1.id } })).status()).toBe(200);
    expect((await request.put(`/api/albums/${albumId}/items`, { data: { animeId: s2.id } })).status()).toBe(409);
  });
});
