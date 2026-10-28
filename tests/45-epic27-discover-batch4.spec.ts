import { test, expect } from "@playwright/test";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";

// anilistId fora da faixa usada por outras fixtures.
const GENRE = "Lote4GridGenre";
const ANILIST_IDS = [912001, 912002, 912003, 912004];

test.describe("Epic 27 (lote 4) — Descobrir: grade responsiva pros resultados filtrados", () => {
  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    for (const [i, anilistId] of ANILIST_IDS.entries()) {
      await prisma.catalogEntry.upsert({
        where: { anilistId },
        create: {
          anilistId,
          titleRomaji: `Anime Lote4 Grid ${i + 1}`,
          genres: GENRE,
          source: "anilist",
        },
        update: { genres: GENRE },
      });
    }
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: ANILIST_IDS } } });
    await prisma.$disconnect();
  });

  test("resultados filtrados quebram linha numa grade (não ficam numa fileira de scroll horizontal só)", async ({
    page,
  }) => {
    // Viewport estreito: a grade do Figma cai para 2 colunas — os 4 itens
    // semeados quebram em 2 linhas. Numa fileira de scroll horizontal
    // (comportamento antigo), os 4 ficariam sempre na MESMA linha (`y` igual).
    await page.setViewportSize({ width: 480, height: 900 });
    await page.goto("/discover");
    await page.getByLabel("Gênero").selectOption(GENRE);

    const card1 = page.getByRole("button", { name: "Anime Lote4 Grid 1" });
    const card2 = page.getByRole("button", { name: "Anime Lote4 Grid 2" });
    const card3 = page.getByRole("button", { name: "Anime Lote4 Grid 3" });
    await expect(card1).toBeVisible();
    await expect(card3).toBeVisible();

    const box1 = await card1.boundingBox();
    const box2 = await card2.boundingBox();
    const box3 = await card3.boundingBox();
    expect(box1).not.toBeNull();
    expect(box2).not.toBeNull();
    expect(box3).not.toBeNull();
    // 1 e 2 ficam na mesma linha (2 colunas)...
    expect(Math.abs(box1!.y - box2!.y)).toBeLessThan(5);
    // ...mas 3 já quebrou pra 2ª linha, mais abaixo.
    expect(box3!.y).toBeGreaterThan(box1!.y + 10);
  });

  test("'+ Acompanhar' do cartão adiciona direto e mantém a pessoa na página, para escolher outras obras", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const posted: number[] = [];
    await page.route("**/api/anime", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      const { anilistId } = route.request().postDataJSON() as { anilistId: number };
      posted.push(anilistId);
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ anime: { id: `fake-${anilistId}` } }) });
    });
    await page.goto("/discover");
    await page.getByLabel("Gênero").selectOption(GENRE);
    const url = page.url();

    const follow = page.getByRole("button", { name: "+ Acompanhar" });
    await expect(follow.first()).toBeVisible();
    await follow.first().click();
    // Segue em /discover (não abre a descrição) e o cartão vira "Acompanhando".
    await expect(page.getByRole("link", { name: "Acompanhando" })).toHaveCount(1);
    expect(page.url()).toBe(url);

    // Dá para acompanhar a próxima sem voltar.
    await follow.first().click();
    await expect(page.getByRole("link", { name: "Acompanhando" })).toHaveCount(2);
    expect(page.url()).toBe(url);
    expect(posted).toHaveLength(2);
    expect(new Set(posted).size).toBe(2);
  });
});