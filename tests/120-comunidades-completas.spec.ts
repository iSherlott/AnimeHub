import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Comunidades em três colunas: coluna da esquerda (capa, nome, Participar, menu), centro (descrição, informações,
// fórum, enquetes, eventos) e direita (membros e comunidades relacionadas); eventos com presença; moderação (fixar,
// trancar, denúncia resolvida no admin, descrição); diretório (minhas, populares, busca) e o item "Comunidades" no menu.
const S1 = 120001;
const S2 = 120002;
const OTHER = 120010;
const GENRE = "Round120Genero";
const TAG = "Comu120";

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Comunidades em três colunas", () => {
  let prisma: PrismaClient;
  const id: Record<string, string> = {};

  async function clean() {
    await prisma.community.deleteMany({ where: { franchiseKey: { in: [S1, OTHER] } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: [S1, S2, OTHER] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    const base = { source: "anilist", onPlatform: true, kind: "EPISODE", status: "FINISHED", format: "TV", genres: GENRE };
    await prisma.catalogEntry.create({ data: { ...base, anilistId: S1, franchiseKey: S1, titleRomaji: `${TAG} Monogatari`, seasonYear: 2019, timelineOrder: 1, descriptionPt: `Sinopse da franquia ${TAG}.` } });
    await prisma.catalogEntry.create({ data: { ...base, anilistId: S2, franchiseKey: S1, kind: "MOVIE", format: "MOVIE", titleRomaji: `${TAG} Monogatari Movie`, seasonYear: 2021, timelineOrder: 2 } });
    await prisma.catalogEntry.create({ data: { ...base, anilistId: OTHER, franchiseKey: OTHER, titleRomaji: `Vizinha ${TAG}`, seasonYear: 2020 } });
    id.user = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    id.admin = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("layout em três colunas: menu, descrição (a sinopse), informações, membros e comunidades relacionadas", async ({ page, request }) => {
    expect((await request.post(`/api/communities/${S1}/membership`)).status()).toBe(200);
    await page.goto(`/comunidades/${S2}`);
    await expect(page).toHaveURL(new RegExp(`/comunidades/${S1}$`));
    await expect(page.getByTestId("community-menu")).toContainText("Fórum");
    await expect(page.getByTestId("community-description")).toContainText(`Sinopse da franquia ${TAG}.`);
    await expect(page.getByTestId("community-info")).toContainText("Anime · série, filme");
    await expect(page.getByTestId("community-members-box")).toContainText("membros (1)");
    await expect(page.getByTestId("community-members-box")).toContainText("E2E");
    await expect(page.getByTestId("community-related").getByRole("link", { name: new RegExp(`Vizinha ${TAG}`) })).toHaveAttribute("href", `/comunidades/${OTHER}`);
    await page.screenshot({ path: test.info().outputPath("comunidade-colunas.png"), fullPage: true });
    await page.getByTestId("community-menu-membros").click();
    await expect(page.getByTestId(`member-${id.user}`)).toBeVisible();
  });

  test("eventos: criar (no fuso de quem cria), marcar presença e a validação de data", async ({ page, request }) => {
    expect((await request.post(`/api/communities/${S1}/events`, { data: { title: "Passado", description: "x", startsAt: "2020-01-01T10:00:00Z" } })).status()).toBe(400);
    await page.goto(`/comunidades/${S1}/eventos`);
    await page.getByTestId("new-event-open").click();
    await page.getByTestId("new-event-title").fill(`Maratona ${TAG}`);
    await page.getByTestId("new-event-description").fill("Todos os episódios de uma vez.");
    await page.getByTestId("new-event-start").fill("2031-03-14T20:00");
    await page.getByTestId("new-event-place").fill("Sala do Discord");
    await page.getByTestId("new-event-submit").click();
    await expect.poll(async () => prisma.communityEvent.count({ where: { title: `Maratona ${TAG}` } })).toBe(1);
    const event = await prisma.communityEvent.findFirstOrThrow({ where: { title: `Maratona ${TAG}` } });
    // O horário digitado no fuso da conta (America/Sao_Paulo) vira instante: 20:00 em Brasília = 23:00 UTC.
    expect(event.startsAt.toISOString()).toBe("2031-03-14T23:00:00.000Z");
    await expect(page.getByTestId(`event-count-${event.id}`)).toContainText("1 vai · 0 talvez");
    await page.getByTestId(`event-maybe-${event.id}`).click();
    await expect(page.getByTestId(`event-count-${event.id}`)).toContainText("0 vão · 1 talvez");
    await page.goto(`/comunidades/${S1}`);
    await expect(page.getByTestId("community-events-preview")).toContainText(`Maratona ${TAG}`);
  });

  test.describe("moderação (admin)", () => {
    test.use({ storageState: adminState });

    test("fixar e trancar: o fixado vem primeiro e o trancado não aceita resposta", async ({ page, request, playwright, baseURL }) => {
      const user = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_TOKEN}` } });
      const make = async (title: string) => (await (await user.post(`/api/communities/${S1}/topics`, { data: { title, body: "Corpo." } })).json()).topicId as string;
      id.first = await make(`Primeiro ${TAG}`);
      id.second = await make(`Segundo ${TAG}`);
      await page.goto(`/comunidades/${S1}/topicos/${id.first}`);
      await page.getByTestId("topic-pin").click();
      await expect(page.getByTestId("topic-pin")).toHaveText("Desafixar");
      await page.getByTestId("topic-lock").click();
      await expect(page.getByTestId("topic-locked-note")).toBeVisible();
      expect((await user.post(`/api/communities/topics/${id.first}/replies`, { data: { body: "oi" } })).status()).toBe(409);
      await user.dispose();
      expect((await request.post(`/api/communities/topics/${id.first}/moderate`, { data: { action: "explodir" } })).status()).toBe(400);
      await page.goto(`/comunidades/${S1}/forum`);
      const rows = page.getByTestId("topic-list").getByRole("listitem");
      await expect(rows.first()).toContainText(`Primeiro ${TAG}`);
      await expect(page.getByTestId(`topic-pinned-${id.first}`)).toBeVisible();
      await expect(page.getByTestId(`topic-locked-${id.first}`)).toBeVisible();
    });

    test("denúncia: vai para Acesso e moderação, e remover tira o tópico da comunidade", async ({ page }) => {
      await page.goto(`/comunidades/${S1}/topicos/${id.second}`);
      await page.getByTestId(`report-${id.second}`).click();
      await page.getByTestId("report-reason").fill("Spoiler sem aviso.");
      await page.getByTestId("report-submit").click();
      await expect(page.getByTestId(`reported-${id.second}`)).toBeVisible();
      const reportRow = await prisma.communityReport.findFirstOrThrow({ where: { topicId: id.second } });
      await page.goto("/admin/acesso");
      const item = page.getByTestId(`community-report-${reportRow.id}`);
      await expect(item).toContainText("Spoiler sem aviso.");
      await expect(item).toContainText(`Segundo ${TAG}`);
      await item.getByTestId(`community-report-remove-${reportRow.id}`).click();
      await expect(page.getByTestId(`community-report-${reportRow.id}`)).toHaveCount(0);
      expect((await prisma.communityTopic.findUniqueOrThrow({ where: { id: id.second } })).deletedAt).not.toBeNull();
      expect((await page.goto(`/comunidades/${S1}/topicos/${id.second}`))?.status()).toBe(404);
    });

    test("a moderação edita a descrição da comunidade", async ({ page }) => {
      await page.goto(`/comunidades/${S1}`);
      await page.getByTestId("community-description-edit").click();
      await page.getByTestId("community-description-input").fill(`Bem-vindos à comunidade ${TAG}!`);
      await page.getByTestId("community-description-save").click();
      await expect(page.getByTestId("community-description")).toContainText(`Bem-vindos à comunidade ${TAG}!`);
    });
  });

  test("diretório: minhas, populares e busca; o menu tem Comunidades", async ({ page }) => {
    await page.goto("/comunidades");
    await expect(page.getByRole("navigation", { name: "Navegação principal" }).first().getByRole("link", { name: "Comunidades" })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId(`my-community-${S1}`)).toBeVisible();
    await page.getByTestId("communities-tab-populares").click();
    await expect(page.getByTestId(`directory-${S1}`)).toContainText("1 membro");
    await page.goto("/comunidades?aba=buscar");
    await page.getByTestId("communities-search").fill(`Vizinha ${TAG}`);
    await page.getByTestId("communities-search-submit").click();
    await expect(page.getByTestId(`directory-${OTHER}`)).toContainText("0 membros");
    await expect(page.getByTestId(`directory-${S1}`)).toHaveCount(0);
  });
});
