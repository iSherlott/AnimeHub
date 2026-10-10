import { test, expect } from "@playwright/test";
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
    await prisma.catalogEntry.deleteMany({ where: { anilistId: { in: ANILIST_IDS } } });
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

    const card1 = page.getByRole("link", { name: "Anime Lote4 Grid 1" });
    const card2 = page.getByRole("link", { name: "Anime Lote4 Grid 2" });
    const card3 = page.getByRole("link", { name: "Anime Lote4 Grid 3" });
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

  test("'+ Acompanhar' do cartão leva ao detalhe público, onde o vínculo é confirmado", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/discover");
    await page.getByLabel("Gênero").selectOption(GENRE);

    const follow = page.getByRole("link", { name: "+ Acompanhar" }).first();
    await expect(follow).toBeVisible();
    await expect(follow).toHaveAttribute("href", /^\/obra\/9120\d\d$/);
  });
});
