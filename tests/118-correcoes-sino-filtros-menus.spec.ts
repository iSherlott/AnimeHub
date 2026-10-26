import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Correções de 26/10: sino com um contador só, 5 notificações por canal + "Ver mais" e "Marcar todas como lidas" no topo;
// sem o atalho de Configurações ao lado do avatar e sem "Minhas conquistas" no menu dele; "Mais filtros" do Explorar com
// palavras-chave (título, sinopse, excluir), episódios e nota; menu do admin agrupado por tipo.
const GENRE = "Round118Genero";

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Correções: sino, filtros e menus", () => {
  let prisma: PrismaClient;
  let userId: string;

  async function clean() {
    await prisma.socialNotification.deleteMany({ where: { userId } });
    await prisma.airingAlert.deleteMany({ where: { userId } });
    await deleteCatalogEntries(prisma, { where: { genres: GENRE } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();
    const actor = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    const base = Date.now() - 60 * 60_000;
    await prisma.socialNotification.createMany({ data: Array.from({ length: 7 }, (_, i) => ({ userId, actorId: actor, type: "NEW_FOLLOWER", createdAt: new Date(base + i * 60_000) })) });
    const common = { source: "anilist", onPlatform: true, kind: "EPISODE", status: "FINISHED", genres: GENRE, seasonYear: 2021 };
    await prisma.catalogEntry.create({ data: { ...common, anilistId: 118001, titleRomaji: "Ilha Dourada Round118", description: "Piratas buscam vingança numa ilha.", episodes: 12, siteScore: 8 } });
    await prisma.catalogEntry.create({ data: { ...common, anilistId: 118002, titleRomaji: "Ilha Isekai Round118", description: "Um herói renasce em outro mundo.", episodes: 24, siteScore: 6 } });
    await prisma.catalogEntry.create({ data: { ...common, anilistId: 118003, titleRomaji: "Cidade Round118", description: "Piratas do ar e vingança.", episodes: 50, siteScore: 9 } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("sino: um número só, 5 por canal, 'Ver mais' e 'Marcar todas como lidas'", async ({ page }) => {
    await page.goto("/dashboard");
    const bell = page.getByRole("button", { name: "Notificações" });
    await expect(bell.getByTestId("bell-counts")).toHaveText("7");
    await bell.click();
    const menu = page.getByRole("menu");
    await menu.getByRole("tab", { name: /Social/ }).click();
    await expect(menu.getByText(/começou a seguir você/)).toHaveCount(5);
    await menu.getByTestId("bell-more").click();
    await expect(menu.getByText(/começou a seguir você/)).toHaveCount(7);
    await menu.getByTestId("bell-mark-all").click();
    await expect(menu.getByTestId("bell-mark-all")).toBeDisabled();
    await expect.poll(async () => prisma.socialNotification.count({ where: { userId, readAt: null } })).toBe(0);
    await page.keyboard.press("Escape");
    await expect(bell.getByTestId("bell-counts")).toHaveCount(0);
  });

  test("cabeçalho sem atalho de Configurações; conquistas fora do menu do avatar (ficam no perfil)", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("banner").getByRole("link", { name: "Configurações" })).toHaveCount(0);
    await page.getByRole("button", { name: "Menu da conta" }).click();
    await expect(page.getByRole("menuitem", { name: "Configurações" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Minhas conquistas" })).toHaveCount(0);
  });

  test("Explorar: palavras no título e na sinopse, palavras excluídas, episódios e nota mínima", async ({ page, request }) => {
    const titles = async (qs: string) => ((await (await request.get(`/api/catalog/page?genre=${GENRE}&${qs}`)).json()).items as Array<{ titleRomaji: string }>).map((i) => i.titleRomaji).sort();
    expect(await titles("titleHas=ilha")).toEqual(["Ilha Dourada Round118", "Ilha Isekai Round118"]);
    expect(await titles("synopsisHas=vingança%20piratas")).toEqual(["Cidade Round118", "Ilha Dourada Round118"]);
    expect(await titles("titleHas=ilha&exclude=isekai")).toEqual(["Ilha Dourada Round118"]);
    expect(await titles("epMin=20&epMax=30")).toEqual(["Ilha Isekai Round118"]);
    expect(await titles("minScore=8.5")).toEqual(["Cidade Round118"]);

    await page.goto("/discover");
    await page.getByLabel("Gênero").selectOption(GENRE);
    await expect(async () => {
      await page.getByRole("button", { name: /Mais filtros/ }).click();
      await expect(page.getByTestId("filter-title-has")).toBeVisible({ timeout: 2000 });
    }).toPass();
    await page.getByTestId("filter-title-has").fill("ilha");
    await page.getByTestId("filter-exclude").fill("isekai");
    await page.getByTestId("more-filters-apply").click();
    await expect(page.getByTestId("explore-card-anilist-118001")).toBeVisible();
    await expect(page.getByTestId("explore-card-anilist-118002")).toHaveCount(0);
    await expect(page.getByTestId("explore-card-anilist-118003")).toHaveCount(0);
  });

  test.describe("admin", () => {
    test.use({ storageState: adminState });
    test("menu agrupado: o grupo da página vem aberto, os outros abrem com um clique", async ({ page }) => {
      await page.goto("/admin/calendario");
      const nav = page.getByRole("navigation", { name: "Administração" });
      await expect(nav.getByRole("link", { name: "Dashboard" })).toBeVisible();
      await expect(nav.getByTestId("admin-group-toggle-episodios")).toHaveAttribute("aria-expanded", "true");
      await expect(nav.getByRole("link", { name: "Calendário" })).toBeVisible();
      await expect(nav.getByRole("link", { name: "Taxonomia" })).toBeHidden();
      await expect(async () => {
        await nav.getByTestId("admin-group-toggle-catalogo").click();
        await expect(nav.getByRole("link", { name: "Taxonomia" })).toBeVisible({ timeout: 2000 });
      }).toPass();
      await nav.getByRole("link", { name: "Taxonomia" }).click();
      await expect(page).toHaveURL(/\/admin\/taxonomia$/);
    });
  });
});
