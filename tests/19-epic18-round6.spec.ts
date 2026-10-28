import { test, expect } from "@playwright/test";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures — anime dedicado só pra
// estes testes, sem interferir com outros specs.
const TITLE_PREF_ANILIST_ID = 900601;
const GENRE_ANILIST_ID = 900602;
const GENRE_LABEL = "Round6TestGenre";

test.describe("Epic 18 — 6ª rodada de auditoria de UX/UI — preferência de idioma no Feed", () => {
  let userId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    userId = user.id;
    await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: TITLE_PREF_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: TITLE_PREF_ANILIST_ID,
        titleRomaji: "Romaji Cru De Teste",
        titleEnglish: "English Title For Preference Test",
        genres: "",
      },
      update: { titleRomaji: "Romaji Cru De Teste", titleEnglish: "English Title For Preference Test" },
    });
    await prisma.$disconnect();
  });

  test("post no Feed respeita a preferência de título (inglês), não crava o romaji cru", async ({ page, request }) => {
    // O padrão do produto agora é Japonês (D-06); este teste escolhe INGLÊS
    // explicitamente (override local, como o menu da conta faz) e confere que
    // o card do post obedece a preferência em vez de sempre mostrar romaji.
    await page.addInitScript(() => {
      localStorage.setItem("anime-hub:title-preference", JSON.stringify({ language: "en", japaneseScript: "romaji" }));
    });
    const uniqueBody = `Post de teste de preferência de título ${Date.now()}`;
    const { animes } = await (await request.get("/api/anime")).json();
    const target = animes.find((a: { anilistId: number }) => a.anilistId === TITLE_PREF_ANILIST_ID);
    const created = await request.post(`/api/anime/${target.id}/posts`, { data: { body: uniqueBody } });
    expect(created.status()).toBe(201);
    await page.goto("/");

    // Verifica pelo perfil próprio (lista cronológica só do autor), não pela
    // timeline "Recomendado" — o ranqueamento por engajamento/idade (Epic 22)
    // pode empurrar um post novo pra fora da 1ª página se a suíte já tiver
    // criado muitos posts antes, o que tornaria essa checagem só de
    // renderização flakey por um motivo que nada tem a ver com o que ela
    // testa de verdade.
    await page.goto(`/users/${userId}`);
    const postCard = page.locator('[data-testid^="post-card-"]').filter({ hasText: uniqueBody });
    await expect(postCard).toBeVisible();
    // Antes da correção da 6ª rodada, PostCard ignorava a preferência e sempre cravava romaji.
    await expect(postCard.getByText("English Title For Preference Test")).toBeVisible();
    await expect(postCard.getByText("Romaji Cru De Teste")).toHaveCount(0);
  });
});

test.describe("Epic 18 — 6ª rodada — chip de gênero clicável leva ao Descobrir filtrado", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: GENRE_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: GENRE_ANILIST_ID,
        titleRomaji: "Anime Do Teste De Gênero",
        genres: GENRE_LABEL,
      },
      update: { genres: GENRE_LABEL },
    });
    animeId = anime.id;

    // O grid "Descobrir" filtra sobre CatalogEntry (catálogo geral), não
    // sobre a lista pessoal do usuário — precisa de uma entrada própria pra
    // o filtro por gênero ter algo pra mostrar depois do clique.
    await prisma.catalogEntry.upsert({
      where: { anilistId: GENRE_ANILIST_ID },
      create: {
        anilistId: GENRE_ANILIST_ID,
        titleRomaji: "Anime Do Teste De Gênero (Catálogo)",
        genres: GENRE_LABEL,
        source: "anilist",
      },
      update: { genres: GENRE_LABEL },
    });
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await deleteCatalogEntries(prisma, { where: { anilistId: GENRE_ANILIST_ID } });
    await prisma.$disconnect();
  });

  test("clicar num chip de gênero na página do anime navega pro Descobrir já filtrado", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);

    const chip = page.getByRole("link", { name: GENRE_LABEL });
    await expect(chip).toHaveAttribute("href", `/discover?genre=${GENRE_LABEL}`);
    await chip.click();

    await expect(page).toHaveURL(`/discover?genre=${GENRE_LABEL}`);
    // O seletor de Gênero já vem no valor do link e o card do catálogo seedado bate.
    await expect(page.getByLabel("Gênero")).toHaveValue(GENRE_LABEL);
    await expect(page.getByRole("button", { name: "Anime Do Teste De Gênero (Catálogo)" })).toBeVisible();
  });
});
