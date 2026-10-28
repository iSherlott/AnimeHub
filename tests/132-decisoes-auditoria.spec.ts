import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Decisões depois da auditoria (27/10): bloqueio no Feed vale para todos; avatar/capa de anime que deixou de ser
// acompanhado volta ao padrão; denúncia de evento e de álbum vão para o painel; "Seguindo" inclui os amigos; visitante
// vê "Adicionar como amigo"; visitas antigas são apagadas; aniversários calculados uma vez por dia.
const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};
const EMAIL = "terceira-132@test.local";
const S1 = 132001;
const WORK = 132100;

test.describe.serial("Decisões da auditoria", () => {
  let prisma: PrismaClient;
  let userId = "";
  let adminId = "";
  let thirdId = "";

  const pair = (a: string, b: string) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });

  async function clean() {
    const people = [userId, adminId, thirdId].filter(Boolean);
    await prisma.post.deleteMany({ where: { body: { contains: "132" } } });
    await prisma.block.deleteMany({ where: { blockerId: { in: people } } });
    await prisma.friendship.deleteMany({ where: { userAId: { in: people }, userBId: { in: people } } });
    await prisma.profileAlbum.deleteMany({ where: { userId } });
    await prisma.profileVisit.deleteMany({ where: { profileId: userId } });
    await prisma.socialNotification.deleteMany({ where: { userId: { in: people }, type: "FRIEND_BIRTHDAY" } });
    await prisma.anime.deleteMany({ where: { anilistId: WORK } });
    await prisma.community.deleteMany({ where: { franchiseKey: S1 } });
    await deleteCatalogEntries(prisma, { where: { anilistId: S1 } });
    await prisma.user.updateMany({ where: { id: { in: [userId, adminId] } }, data: { avatarUrl: null, bannerUrl: null, birthdayCheckedOn: null, birthDay: null, birthMonth: null } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    thirdId = (await prisma.user.create({ data: { email: EMAIL, passwordHash: "e2e-fixture-not-a-real-hash", passwordSalt: "e2e-fixture-not-a-real-salt", displayName: "Terceira 132" } })).id;
    await clean();
  });

  test.afterAll(async () => {
    await clean();
    await prisma.user.deleteMany({ where: { email: EMAIL } });
    await prisma.$disconnect();
  });

  test("Feed: o comentário de quem o autor da publicação bloqueou some para todos", async ({ browser }) => {
    const post = await prisma.post.create({ data: { userId, body: "Publicação 132" } });
    await prisma.postComment.create({ data: { postId: post.id, userId: thirdId, body: "Comentário da Terceira 132" } });
    const admin = await browser.newContext({ storageState: adminState });
    const bodies = async () => ((await (await admin.request.get(`/api/posts/${post.id}/comments`)).json()).comments as Array<{ body: string }>).map((c) => c.body);
    expect(await bodies()).toContain("Comentário da Terceira 132");
    await prisma.block.create({ data: { blockerId: userId, blockedId: thirdId } });
    expect(await bodies()).not.toContain("Comentário da Terceira 132");
    await admin.close();
    await prisma.block.deleteMany({ where: { blockerId: userId } });
  });

  test("avatar e capa de anime que deixou de ser acompanhado voltam ao padrão", async ({ page, request }) => {
    const anime = await prisma.anime.create({ data: { userId, anilistId: WORK, titleRomaji: "Obra 132", genres: "", coverImage: "https://example.test/spec132-cover.jpg", bannerImage: "https://example.test/spec132-banner.jpg" } });
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: "https://example.test/spec132-cover.jpg", bannerUrl: "https://example.test/spec132-banner.jpg" } });
    expect((await request.delete(`/api/anime/${anime.id}`)).ok()).toBe(true);
    expect(await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { avatarUrl: true, bannerUrl: true } })).toEqual({ avatarUrl: null, bannerUrl: null });

    // Imagem que já não é de nenhum anime acompanhado: some ao abrir o Editar perfil.
    await prisma.user.update({ where: { id: userId }, data: { avatarUrl: "https://example.test/de-outro-anime.jpg" } });
    await page.goto("/perfil/editar");
    await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).avatarUrl).toBeNull();
  });

  test("denunciar evento: vai para a fila das comunidades; remover apaga o evento", async ({ browser, page }) => {
    await prisma.catalogEntry.create({ data: { source: "anilist", onPlatform: true, kind: "EPISODE", status: "FINISHED", format: "TV", anilistId: S1, franchiseKey: S1, titleRomaji: "Decisões 132", seasonYear: 2020, timelineOrder: 1 } });
    const admin = await browser.newContext({ storageState: adminState });
    await admin.request.post(`/api/communities/${S1}/membership`);
    const eventId = (await (await admin.request.post(`/api/communities/${S1}/events`, { data: { title: "Evento ofensivo 132", description: "x", startsAt: "2031-02-01T20:00:00Z" } })).json()).eventId as string;

    await page.goto(`/comunidades/${S1}/eventos`);
    await page.getByTestId(`report-${eventId}`).click();
    await page.getByTestId("report-reason").fill("Ofensivo");
    await page.getByTestId("report-submit").click();
    await expect(page.getByTestId(`reported-${eventId}`)).toBeVisible();

    const adminPage = await admin.newPage();
    await adminPage.goto("/admin/acesso");
    const panel = adminPage.getByTestId("admin-community-reports");
    await expect(panel).toContainText("Evento de E2E Admin");
    await expect(panel).toContainText("Evento ofensivo 132");
    const report = await prisma.communityReport.findFirstOrThrow({ where: { eventId } });
    await adminPage.getByTestId(`community-report-remove-${report.id}`).click();
    await expect.poll(async () => (await prisma.communityEvent.findUniqueOrThrow({ where: { id: eventId } })).deletedAt).not.toBeNull();
    await admin.close();
  });

  test("denunciar álbum: remover esconde de todos; o dono vê o aviso e só pode apagar", async ({ browser, page, request }) => {
    const albumId = (await (await request.post("/api/albums", { data: { name: "Álbum ofensivo 132" } })).json()).id as string;
    expect((await request.post(`/api/albums/${albumId}/report`, { data: { reason: "SPAM" } })).status()).toBe(400);
    const admin = await browser.newContext({ storageState: adminState });
    const adminPage = await admin.newPage();
    await adminPage.goto(`/users/${userId}/albuns/${albumId}`);
    await adminPage.getByTestId(`report-album-${albumId}`).click();
    await adminPage.getByLabel("Spam ou conteúdo repetitivo").check();
    await adminPage.getByTestId("report-continue").click();
    await adminPage.getByTestId("report-send").click();
    await expect(adminPage.getByTestId(`reported-album-${albumId}`)).toBeVisible();

    await adminPage.goto("/admin/acesso");
    const panel = adminPage.getByTestId("admin-profile-reports");
    await expect(panel).toContainText("Álbum de E2E Test User");
    const report = await prisma.profileReport.findFirstOrThrow({ where: { albumId } });
    await adminPage.getByTestId(`profile-report-remove-${report.id}`).click();
    await expect.poll(async () => (await prisma.profileAlbum.findUniqueOrThrow({ where: { id: albumId } })).removedAt).not.toBeNull();

    expect((await adminPage.goto(`/users/${userId}/albuns/${albumId}`))?.status()).toBe(404);
    await adminPage.goto(`/users/${userId}`);
    await expect(adminPage.getByTestId(`album-${albumId}`)).toHaveCount(0);
    await admin.close();

    await page.goto(`/users/${userId}/albuns/${albumId}`);
    await expect(page.getByTestId("album-removed-notice")).toBeVisible();
    await expect(page.getByTestId("album-edit")).toHaveCount(0);
    expect((await request.patch(`/api/albums/${albumId}`, { data: { name: "Outro nome" } })).status()).toBe(403);
    expect((await request.delete(`/api/albums/${albumId}`)).ok()).toBe(true);
  });

  test("'Seguindo' inclui as publicações dos amigos", async ({ request }) => {
    const post = await prisma.post.create({ data: { userId: thirdId, body: "Publicação da amiga 132" } });
    const ids = async () => ((await (await request.get("/api/posts?tab=following")).json()).posts as Array<{ id: string }>).map((p) => p.id);
    expect(await ids()).not.toContain(post.id);
    await prisma.friendship.create({ data: pair(userId, thirdId) });
    expect(await ids()).toContain(post.id);
  });

  test("visitante sem conta não abre o perfil: vai ao login, que o devolve ao perfil", async ({ browser }) => {
    const anon = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await anon.newPage();
    await page.goto(`/users/${adminId}`);
    await expect(page).toHaveURL(`/login?next=${encodeURIComponent(`/users/${adminId}`)}`);
    await anon.close();
  });

  test("visitas com mais de 90 dias são apagadas na próxima visita ao perfil", async ({ browser }) => {
    await prisma.profileVisit.create({ data: { profileId: userId, visitorId: thirdId, visitedAt: new Date(Date.now() - 100 * 86_400_000) } });
    const admin = await browser.newContext({ storageState: adminState });
    await (await admin.newPage()).goto(`/users/${userId}`);
    await admin.close();
    expect(await prisma.profileVisit.count({ where: { profileId: userId, visitorId: thirdId } })).toBe(0);
    expect(await prisma.profileVisit.count({ where: { profileId: userId, visitorId: adminId } })).toBe(1);
  });

  test("aniversários: o aviso do dia é calculado uma vez por dia", async ({ browser, request }) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", month: "numeric", day: "numeric" }).formatToParts(new Date());
    const today = { day: Number(parts.find((p) => p.type === "day")?.value), month: Number(parts.find((p) => p.type === "month")?.value) };
    const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
    await prisma.user.update({ where: { id: thirdId }, data: { birthDay: today.day, birthMonth: today.month } });
    const count = () => prisma.socialNotification.count({ where: { userId, type: "FRIEND_BIRTHDAY" } });

    // Já calculado hoje: o sino não recalcula.
    await prisma.user.update({ where: { id: userId }, data: { birthdayCheckedOn: dayKey } });
    await request.get("/api/notifications");
    expect(await count()).toBe(0);
    // Primeira consulta do dia: calcula e guarda o dia.
    await prisma.user.update({ where: { id: userId }, data: { birthdayCheckedOn: null } });
    await request.get("/api/notifications");
    expect(await count()).toBe(1);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).birthdayCheckedOn).toBe(dayKey);

    // Amizade nova (pode ser aniversariante hoje): a marca do dia é apagada e o cálculo refeito.
    await prisma.friendship.deleteMany({ where: pair(userId, adminId) });
    await prisma.friendRequest.deleteMany({ where: { fromId: { in: [userId, adminId] }, toId: { in: [userId, adminId] } } });
    expect((await request.put(`/api/users/${adminId}/friend`)).ok()).toBe(true);
    const admin = await browser.newContext({ storageState: adminState });
    expect(await (await admin.request.put(`/api/users/${userId}/friend`)).json()).toEqual({ state: "friends" });
    await admin.close();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).birthdayCheckedOn).toBeNull();
    await prisma.friendship.deleteMany({ where: pair(userId, adminId) });
  });
});
