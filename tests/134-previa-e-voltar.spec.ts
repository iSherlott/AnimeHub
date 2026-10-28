import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";
import { todayAtNoonSaoPaulo } from "./test-time";

// Tocar/clicar num anime do calendário ou da aba Animes do perfil abre a prévia (no celular, a gaveta de baixo; no
// computador, o cartão ao lado), com o botão "Ver página da obra" — não leva direto à página. E voltar da página da obra
// devolve a pessoa ao ponto em que estava: mesma semana, mesmo filtro e mesma altura no calendário; mesma aba no perfil.
const NEXT_WEEK = 134001;
const OWNED = 134002;
const DAY = 24 * 3600 * 1000;

test.describe.serial("Prévia ao tocar e voltar para o mesmo ponto", () => {
  let prisma: PrismaClient;
  let userId = "";

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [NEXT_WEEK, OWNED] } } });
    await prisma.anime.deleteMany({ where: { anilistId: OWNED } });
    await prisma.airingScheduleEntry.createMany({
      data: [
        { anilistId: NEXT_WEEK, episode: 2, airingAt: new Date(todayAtNoonSaoPaulo().getTime() + 7 * DAY), titleRomaji: "Semana Que Vem Round134" },
        { anilistId: OWNED, episode: 3, airingAt: todayAtNoonSaoPaulo(), titleRomaji: "Da Lista Round134" },
      ],
    });
    await prisma.anime.create({ data: { userId, anilistId: OWNED, titleRomaji: "Da Lista Round134", genres: "Ação", seriesKey: "da lista round134" } });
  });

  test.afterAll(async () => {
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [NEXT_WEEK, OWNED] } } });
    await prisma.anime.deleteMany({ where: { anilistId: OWNED } });
    await prisma.$disconnect();
  });

  test.describe("celular", () => {
    test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

    test("tocar num item do calendário abre a gaveta com a prévia, sem sair da página", async ({ page }) => {
      await page.goto("/calendar");
      const entry = page.getByTestId(`calendar-entry-${OWNED}-3`);
      await entry.tap();
      const sheet = page.getByRole("dialog", { name: /Prévia de/ });
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole("link", { name: "Ver página da obra" })).toBeVisible();
      await expect(page).toHaveURL(/\/calendar$/);
      await sheet.getByRole("button", { name: "Fechar prévia" }).tap();
      await expect(sheet).toBeHidden();
    });

    test("tocar numa capa da aba Animes do perfil abre a gaveta com a prévia", async ({ page }) => {
      await page.goto(`/users/${userId}`);
      await page.getByTestId("tab-animes").click();
      await page.getByTestId(`profile-anime-open-${OWNED}`).tap();
      const sheet = page.getByRole("dialog", { name: /Prévia de/ });
      await expect(sheet.getByTestId(`profile-anime-preview-${OWNED}`)).toBeVisible();
      await expect(sheet.getByRole("link", { name: "Ver página da obra" })).toHaveAttribute("href", `/anime/${OWNED}`);
      await expect(page).toHaveURL(new RegExp(`/users/${userId}\\?aba=animes$`));
    });
  });

  test.describe("computador", () => {
    test.use({ viewport: { width: 1280, height: 560 } });

    test("clique abre a prévia presa; voltar da obra reabre a mesma semana, o mesmo filtro e a mesma altura", async ({ page }) => {
      await page.goto("/calendar");
      await page.getByRole("button", { name: "Todos", exact: true }).click();
      await page.getByRole("button", { name: "Próxima semana", exact: true }).click();
      const entry = page.getByTestId(`calendar-entry-${NEXT_WEEK}-2`);
      await expect(entry).toBeVisible();
      await page.evaluate(() => window.scrollTo(0, 260));
      await page.waitForTimeout(400);
      await entry.click();
      const preview = page.getByRole("dialog", { name: /Prévia de/ });
      await expect(preview).toBeVisible();
      // Presa: tirar o mouse de cima não fecha.
      await page.mouse.move(5, 5);
      await page.waitForTimeout(400);
      await expect(preview).toBeVisible();
      const before = await page.evaluate(() => window.scrollY);
      expect(before).toBeGreaterThan(100);

      await preview.getByRole("link", { name: "Ver página da obra" }).click();
      await expect(page).toHaveURL(new RegExp(`/anime/${NEXT_WEEK}$`));
      await page.goBack();
      await expect(page).toHaveURL(/\/calendar$/);
      await expect(page.getByTestId(`calendar-entry-${NEXT_WEEK}-2`)).toBeVisible();
      await expect(page.getByRole("button", { name: "Todos", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before - 10);
    });

    test("perfil: a aba Animes fica no endereço e volta aberta depois da página da obra", async ({ page }) => {
      await page.goto(`/users/${userId}`);
      await page.getByTestId("tab-animes").click();
      await expect(page).toHaveURL(new RegExp(`\\?aba=animes$`));
      await page.getByTestId(`profile-anime-open-${OWNED}`).click();
      await page.getByRole("dialog", { name: /Prévia de/ }).getByRole("link", { name: "Ver página da obra" }).click();
      await expect(page).toHaveURL(new RegExp(`/anime/${OWNED}$`));
      await page.goBack();
      await expect(page.getByTestId("tab-animes")).toHaveAttribute("aria-selected", "true");
      await expect(page.getByTestId(`profile-anime-${OWNED}`)).toBeVisible();
    });
  });
});
