import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Avisos das comunidades: o sino avisa de respostas nos tópicos em que a pessoa participa (sem acumular enquanto não lê)
// e de eventos novos nas comunidades dela; a preferência "Comunidades" desliga; e a busca dentro do fórum.
const S1 = 122001;
const TAG = "Aviso122";
const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};
type SocialItem = { id: string; type: string; href: string | null; subject: string | null; community: string | null; readAt: string | null };

test.describe.serial("Avisos das comunidades e busca no fórum", () => {
  let prisma: PrismaClient;
  let userId = "";
  let adminId = "";
  let topicId = "";

  async function clean() {
    await prisma.socialNotification.deleteMany({ where: { userId: { in: [userId, adminId] }, type: { in: ["COMMUNITY_REPLY", "COMMUNITY_EVENT"] } } });
    await prisma.community.deleteMany({ where: { franchiseKey: S1 } });
    await deleteCatalogEntries(prisma, { where: { anilistId: S1 } });
  }

  async function social(request: APIRequestContext): Promise<SocialItem[]> {
    return ((await (await request.get("/api/notifications")).json()).social as SocialItem[]).filter((n) => n.type.startsWith("COMMUNITY_"));
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    await clean();
    await prisma.user.updateMany({ where: { id: { in: [userId, adminId] } }, data: { notifyCommunity: true } });
    await prisma.catalogEntry.create({ data: { source: "anilist", onPlatform: true, kind: "EPISODE", status: "FINISHED", format: "TV", anilistId: S1, franchiseKey: S1, titleRomaji: `${TAG} Monogatari`, seasonYear: 2020, timelineOrder: 1 } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.user.updateMany({ where: { id: { in: [userId, adminId] } }, data: { notifyCommunity: true } });
    await prisma.$disconnect();
  });

  test("resposta no tópico avisa quem participa; sem acumular enquanto não lê", async ({ browser, request }) => {
    expect((await request.post(`/api/communities/${S1}/membership`)).status()).toBe(200);
    const created = await request.post(`/api/communities/${S1}/topics`, { data: { title: `Teoria do final ${TAG}`, body: "O que vocês acham?" } });
    expect(created.status()).toBe(201);
    topicId = (await created.json()).topicId;

    const admin = await browser.newContext({ storageState: adminState });
    expect((await admin.request.post(`/api/communities/${S1}/membership`)).status()).toBe(200);
    const first = (await (await admin.request.post(`/api/communities/topics/${topicId}/replies`, { data: { body: "Acho que ele volta." } })).json()).replyId as string;
    let items = await social(request);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ type: "COMMUNITY_REPLY", subject: `Teoria do final ${TAG}`, community: `${TAG} Monogatari`, href: `/comunidades/${S1}/topicos/${topicId}?pagina=ultima#resposta-${first}` });

    // Outra resposta antes de ler: o mesmo aviso, apontando para a resposta nova.
    const second = (await (await admin.request.post(`/api/communities/topics/${topicId}/replies`, { data: { body: "Ou não." } })).json()).replyId as string;
    items = await social(request);
    expect(items).toHaveLength(1);
    expect(items[0].href).toContain(`#resposta-${second}`);

    // Quem respondeu também passa a participar: a resposta da dona do tópico avisa o admin.
    expect((await request.post(`/api/communities/topics/${topicId}/replies`, { data: { body: "Boa!" } })).status()).toBe(201);
    expect((await social(admin.request)).map((n) => n.type)).toEqual(["COMMUNITY_REPLY"]);

    // Depois de ler, a próxima resposta é um aviso novo.
    expect((await request.post(`/api/notifications/social/${items[0].id}/read`)).ok()).toBe(true);
    await admin.request.post(`/api/communities/topics/${topicId}/replies`, { data: { body: "Mais uma." } });
    expect((await social(request)).filter((n) => !n.readAt)).toHaveLength(1);
    await admin.close();
  });

  test("evento novo avisa os membros; o sino mostra o texto e leva ao evento", async ({ browser, page }) => {
    const admin = await browser.newContext({ storageState: adminState });
    const created = await admin.request.post(`/api/communities/${S1}/events`, { data: { title: `Maratona ${TAG}`, description: "Todos juntos.", startsAt: "2031-05-01T23:00:00Z" } });
    expect(created.status()).toBe(201);
    const eventId = (await created.json()).eventId as string;
    await admin.close();

    await page.goto("/dashboard");
    const bell = page.getByRole("button", { name: "Notificações" });
    await bell.click();
    const menu = page.getByRole("menu");
    await menu.getByRole("tab", { name: /Social/ }).click();
    const item = menu.getByText(`marcou o evento "Maratona ${TAG}" na comunidade ${TAG} Monogatari`);
    await expect(item).toBeVisible();
    await expect(menu.getByText(`respondeu no tópico "Teoria do final ${TAG}"`).first()).toBeVisible();
    await item.click();
    await expect(page).toHaveURL(new RegExp(`/comunidades/${S1}/eventos#evento-${eventId}$`));
    await expect(page.locator(`#evento-${eventId}`)).toBeVisible();
  });

  test("a preferência Comunidades desliga os avisos", async ({ browser, page, request }) => {
    await page.goto("/configuracoes");
    await page.getByRole("checkbox", { name: /Comunidades/ }).uncheck();
    await page.getByTestId("save-settings").click();
    await expect(page.getByRole("status")).toContainText("Configurações salvas");
    expect((await (await request.get("/api/users/me/settings")).json()).preferences.notifyCommunity).toBe(false);

    await prisma.socialNotification.deleteMany({ where: { userId, type: { in: ["COMMUNITY_REPLY", "COMMUNITY_EVENT"] } } });
    const admin = await browser.newContext({ storageState: adminState });
    await admin.request.post(`/api/communities/topics/${topicId}/replies`, { data: { body: "Ninguém avisado." } });
    await admin.request.post(`/api/communities/${S1}/events`, { data: { title: `Outro ${TAG}`, description: "x", startsAt: "2031-06-01T23:00:00Z" } });
    await admin.close();
    expect(await social(request)).toHaveLength(0);
  });

  test("busca no fórum: título, texto e respostas; todas as palavras; limpar", async ({ page, request }) => {
    expect((await request.post(`/api/communities/${S1}/topics`, { data: { title: `Trilha sonora ${TAG}`, body: "Qual a melhor abertura?" } })).status()).toBe(201);
    expect((await request.post(`/api/communities/${S1}/topics`, { data: { title: `Dublagem ${TAG}`, body: "Vale a pena?" } })).status()).toBe(201);

    await page.goto(`/comunidades/${S1}/forum`);
    await page.getByTestId("forum-search-input").fill("abertura");
    await page.getByTestId("forum-search-submit").click();
    await expect(page).toHaveURL(new RegExp(`/comunidades/${S1}/forum\\?q=abertura$`));
    const list = page.getByTestId("topic-list");
    await expect(list).toContainText(`Trilha sonora ${TAG}`);
    await expect(list).not.toContainText(`Dublagem ${TAG}`);
    await expect(page.getByTestId("forum-search-summary")).toContainText("1 tópico encontrado");

    // A palavra só aparece numa resposta ("Acho que ele volta.").
    await page.goto(`/comunidades/${S1}/forum?q=volta`);
    await expect(page.getByTestId("topic-list")).toContainText(`Teoria do final ${TAG}`);

    // Todas as palavras precisam aparecer.
    await page.goto(`/comunidades/${S1}/forum?q=${encodeURIComponent("dublagem abertura")}`);
    await expect(page.getByTestId("community-empty")).toContainText("Nenhum tópico com essas palavras");

    await page.getByRole("link", { name: "Limpar busca" }).click();
    await expect(page.getByTestId("community-forum")).toContainText("Fórum (3)");
  });
});
