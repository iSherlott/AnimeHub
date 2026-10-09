import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// F5 (D-05/D-07/D-08): Dashboard "Seu dia, em anime.", semana segunda→domingo,
// horário antes de "EP", rótulo de fuso e navegação do Figma (13:41078).
const OWNED_TODAY_ID = 906000;
const NOT_OWNED_TODAY_ID = 906001;

function todayAtNoon(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
}

test.describe("Dashboard, calendário e navegação", () => {
  let prisma: PrismaClient;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: OWNED_TODAY_ID } },
      create: { userId: user.id, anilistId: OWNED_TODAY_ID, titleRomaji: "Dashboard Anime Da Lista Hoje", genres: "" },
      update: {},
    });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [OWNED_TODAY_ID, NOT_OWNED_TODAY_ID] } } });
    await prisma.airingScheduleEntry.createMany({
      data: [
        { anilistId: OWNED_TODAY_ID, episode: 9, airingAt: todayAtNoon(), titleRomaji: "Dashboard Anime Da Lista Hoje" },
        { anilistId: NOT_OWNED_TODAY_ID, episode: 2, airingAt: todayAtNoon(), titleRomaji: "Dashboard Anime Fora Da Lista" },
      ],
    });
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("Dashboard mostra só os lançamentos de hoje da MINHA lista, com horário antes do episódio", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: "Seu dia, em anime." })).toBeVisible();

    const list = page.getByTestId("today-list");
    await expect(list).toContainText("Dashboard Anime Da Lista Hoje");
    await expect(list).not.toContainText("Dashboard Anime Fora Da Lista");
    const row = list.locator("li").filter({ hasText: "Dashboard Anime Da Lista Hoje" });
    await expect(row).toContainText("12:00");
    await expect(row).toContainText("Episódio 9");

    await expect(page.getByTestId("counter-today")).toContainText(/\d+/);
    await expect(page.getByTestId("counter-following")).toContainText("animes acompanhando");
  });

  test("falha ao carregar mostra erro com 'Tentar novamente' e NÃO exibe contadores zerados", async ({ page }) => {
    await page.route("**/api/calendar**", (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.goto("/dashboard");

    await expect(page.getByRole("alert").filter({ hasText: "Não foi possível carregar os lançamentos" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Tentar novamente" })).toBeVisible();
    await expect(page.getByTestId("dashboard-counters")).toHaveCount(0);

    await page.unroute("**/api/calendar**");
    await page.getByRole("button", { name: "Tentar novamente" }).click();
    await expect(page.getByTestId("today-list")).toBeVisible();
  });

  test.describe("visitante", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("é levado ao login com o destino /dashboard preservado", async ({ page }) => {
      await page.goto("/dashboard");
      await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
    });

    test("o logo leva o visitante a Explorar e a navegação segue a ordem do Figma", async ({ page }) => {
      await page.goto("/calendar");
      await expect(page.getByRole("link", { name: "Anime Hub" })).toHaveAttribute("href", "/discover");
      const nav = page.getByRole("link", { name: /^(Explorar|Calendário|Minha lista|Comunidade)$/ });
      await expect(nav).toHaveText(["Explorar", "Calendário", "Minha lista", "Comunidade"]);
    });
  });

  test("autenticado: o logo leva ao Dashboard", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page.getByRole("link", { name: "Anime Hub" })).toHaveAttribute("href", "/dashboard");
  });

  test("calendário começa na segunda, mostra o fuso e coloca o horário antes de EP", async ({ page }) => {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos os lançamentos" }).click();

    const headers = page.locator("p, span").filter({ hasText: /^(SEG|TER|QUA|QUI|SEX|SÁB|DOM)$/ });
    await expect(headers.first()).toHaveText("SEG");
    await expect(headers.last()).toHaveText("DOM");

    await expect(page.getByTestId("calendar-timezone")).toContainText("Horários no fuso");
    await expect(page.getByText("12:00 · EP 9").first()).toBeVisible();
  });
});
