import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";

// anilistId fora da faixa usada por outras fixtures.
const CATALOG_ANILIST_ID_A = 907001;
const CATALOG_ANILIST_ID_B = 907002;
const GENRE = "AuditComedyR21";
const OTHER_GENRE = "AuditDramaR21";

test.describe("Epic 18 — 21ª rodada de auditoria de UX/UI — filtro de gênero também vale pra fileira de busca da AniList", () => {
  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    // Precisa de 2+ entradas do catálogo com esse gênero pra ele aparecer
    // como chip filtrável (Descobrir só lista gêneros compartilhados por
    // 2+ itens, ver DiscoverPageContent).
    await prisma.catalogEntry.upsert({
      where: { anilistId: CATALOG_ANILIST_ID_A },
      create: { anilistId: CATALOG_ANILIST_ID_A, titleRomaji: "Catálogo Round21 Genre Filter A", genres: GENRE, source: "anilist" },
      update: { genres: GENRE },
    });
    await prisma.catalogEntry.upsert({
      where: { anilistId: CATALOG_ANILIST_ID_B },
      create: { anilistId: CATALOG_ANILIST_ID_B, titleRomaji: "Catálogo Round21 Genre Filter B", genres: GENRE, source: "anilist" },
      update: { genres: GENRE },
    });
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.catalogEntry.deleteMany({
      where: { anilistId: { in: [CATALOG_ANILIST_ID_A, CATALOG_ANILIST_ID_B] } },
    });
    await prisma.$disconnect();
  });

  function searchItem(anilistId: number, titleRomaji: string, genres: string[]) {
    return {
      key: `anilist-${anilistId}`,
      anilistId,
      kitsuId: null,
      titleRomaji,
      titleEnglish: null,
      titleNative: null,
      coverImage: null,
      bannerImage: null,
      description: null,
      episodes: null,
      genres,
      status: null,
      season: null,
      startDate: null,
      endDate: null,
      nextEpisodeNumber: null,
      nextEpisodeAt: null,
      popularityRank: null,
      cached: false,
      inMyList: false,
      animeId: null,
    };
  }

  // Achado real da 21ª rodada de auditoria (Epic 18): a fileira "Resultados
  // da busca (AniList)" mandava só o texto pra API — os chips de gênero/
  // status/temporada/ano continuavam visíveis como se estivessem em vigor
  // pras 2 fileiras, mas só a fileira do catálogo local de fato os
  // aplicava. Com "COMEDY" selecionado, a busca ao vivo continuava
  // misturando títulos de qualquer gênero que só batessem o texto.
  test("selecionar um gênero também filtra os resultados da busca (AniList)", async ({ page }) => {
    await page.route("**/api/anilist/search*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          cached: false,
          results: [
            searchItem(907101, "Round21 Search Hit — gênero certo", [GENRE]),
            searchItem(907102, "Round21 Search Hit — gênero errado", [OTHER_GENRE]),
          ],
        }),
      });
    });

    await page.goto("/discover");
    await page.getByPlaceholder("Buscar anime...").fill("Round21 Search Hit");
    // O título do cartão é um link para o detalhe — escopa por ele.
    const correctCard = page.getByRole("link", { name: "Round21 Search Hit — gênero certo" });
    const wrongCard = page.getByRole("link", { name: "Round21 Search Hit — gênero errado" });
    await expect(correctCard).toBeVisible();
    await expect(wrongCard).toBeVisible();

    await page.getByLabel("Gênero").selectOption(GENRE);

    await expect(correctCard).toBeVisible();
    await expect(wrongCard).not.toBeVisible();
  });
});
