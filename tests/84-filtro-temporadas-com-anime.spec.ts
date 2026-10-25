import { test, expect } from "@playwright/test";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";

// O filtro de temporada só oferece temporadas que têm anime na plataforma, e fica na mesma linha de Gênero e Status.
const IDS = [984001, 984002, 984003];

test.describe("Filtro de temporada só com o que tem anime", () => {
  let prisma: PrismaClient;

  async function clean() {
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: IDS } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    await prisma.catalogEntry.createMany({
      data: [
        { anilistId: IDS[0], titleRomaji: "Obra Filtro 2031 Inverno", season: "WINTER", seasonYear: 2031, genres: "Comedy", source: "anidb", onPlatform: true },
        { anilistId: IDS[1], titleRomaji: "Obra Filtro 2031 Verao", season: "SUMMER", seasonYear: 2031, genres: "Comedy", source: "anidb", onPlatform: true },
        // fora da plataforma (cache da AniList): não pode gerar opção
        { anilistId: IDS[2], titleRomaji: "Obra Cache 2033", season: "FALL", seasonYear: 2033, genres: "Comedy", source: "anilist", onPlatform: false },
      ],
    });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("API lista só temporadas com anime na plataforma", async ({ request }) => {
    const res = await request.get("/api/seasons");
    expect(res.status()).toBe(200);
    const { seasons } = (await res.json()) as { seasons: { slug: string; count: number }[] };
    const slugs = seasons.map((s) => s.slug);
    expect(slugs).toContain("winter2031");
    expect(slugs).toContain("summer2031");
    expect(slugs).not.toContain("fall2033");
    expect(slugs).not.toContain("spring2031");
  });

  test("a página da temporada mostra o seletor ao lado de Gênero e Status, sem temporadas vazias", async ({ page }) => {
    await page.goto("/temporada/summer2031");
    const filter = page.getByTestId("season-filter");
    await expect(filter).toBeVisible();
    await expect(page.getByRole("button", { name: "Todas as temporadas" })).toHaveCount(0);

    const season = await filter.boundingBox();
    const genre = await page.getByText("Gênero", { exact: true }).first().boundingBox();
    expect(season && genre && Math.abs(season.y - genre.y) < 40).toBeTruthy();

    await expect(filter).toHaveValue("summer2031");
    const labels = await filter.locator("option").allTextContents();
    expect(labels).toContain("Winter2031");
    expect(labels).toContain("Summer2031");
    expect(labels).not.toContain("Spring2031");
    expect(labels).not.toContain("Autumn2033");

    await filter.selectOption("winter2031");
    await expect(page).toHaveURL(/\/temporada\/winter2031$/);
  });
});
