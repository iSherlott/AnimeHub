import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { deleteCatalogEntries } from "./catalog-cleanup";

// Pedido de 09/11: a ficha da obra mostra o X (antigo Twitter) oficial, vindo dos links da AniList.
const WITH_X = 144001;
const WITHOUT_X = 144002;

test.describe.serial("X oficial na ficha da obra", () => {
  let prisma: PrismaClient;

  async function clean() {
    await prisma.production.deleteMany({ where: { anilistId: { in: [WITH_X, WITHOUT_X] } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: [WITH_X, WITHOUT_X] } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: [WITH_X, WITHOUT_X] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    for (const [anilistId, title, twitter] of [
      [WITH_X, "Com X Round144", JSON.stringify([{ handle: "obra_PR", url: "https://x.com/obra_PR", language: "Japanese" }, { handle: "Obra_EN", url: "https://x.com/Obra_EN", language: "English" }])],
      [WITHOUT_X, "Sem X Round144", null],
    ] as const) {
      const franchise = await prisma.franchise.create({ data: { rootAnilistId: anilistId, name: title } });
      await prisma.production.create({ data: { anilistId, franchiseId: franchise.id, titleRomaji: title, seasonNumber: 1, format: "TV", status: "RELEASING", season: "FALL", seasonYear: 2026, fetchedAt: new Date() } });
      await prisma.catalogEntry.create({ data: { anilistId, titleRomaji: title, source: "anilist", onPlatform: true, season: "FALL", seasonYear: 2026, twitterLinksJson: twitter } });
    }
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("a conta japonesa primeiro, a em inglês com a língua; abre em nova aba", async ({ page }) => {
    await page.goto(`/obra/${WITH_X}`);
    const info = page.getByTestId("work-info");
    await expect(info.getByText("X (Twitter)")).toBeVisible();
    const links = info.getByTestId("work-twitter");
    await expect(links).toHaveCount(2);
    await expect(links.nth(0)).toHaveText("@obra_PR ↗");
    await expect(links.nth(0)).toHaveAttribute("href", "https://x.com/obra_PR");
    await expect(links.nth(0)).toHaveAttribute("target", "_blank");
    await expect(links.nth(0)).toHaveAttribute("rel", /noopener/);
    await expect(links.nth(1)).toHaveText("@Obra_EN (inglês) ↗");
  });

  test("sem conta no X, a linha não aparece", async ({ page }) => {
    await page.goto(`/obra/${WITHOUT_X}`);
    await expect(page.getByTestId("work-info")).toBeVisible();
    await expect(page.getByTestId("work-info").getByText("X (Twitter)")).toHaveCount(0);
  });
});
