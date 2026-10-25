import { test, expect } from "@playwright/test";
import { waitEpisodesStreamed } from "./streaming";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";
import { seedGlobalEpisodes } from "./global-episodes";

// anilistId fora da faixa usada por outras fixtures.
const ANIME_ANILIST_ID = 901200;

// Fase 4 (ADR 0009): os episódios são globais, um por número na obra. As "temporadas internas" da Kitsu deixaram de
// existir (cada temporada da franquia é uma obra própria, com aba na página — spec 100), então a lista não tem mais
// seletor de temporada: tem a busca e a sinopse atrás do aviso de spoiler.
test.describe("Lista de episódios — episódios globais e busca", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const title = "Anime Com Quatro Episodios Pra Testar Lista De Episódios";
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: ANIME_ANILIST_ID } },
      create: { userId: user.id, anilistId: ANIME_ANILIST_ID, titleRomaji: title, genres: "" },
      update: {},
    });
    animeId = anime.id;
    await seedGlobalEpisodes(prisma, ANIME_ANILIST_ID, { titleRomaji: title }, [
      { number: 1, titleRomaji: "O Início Da Jornada", synopsis: "Resumo do episódio 1." },
      { number: 2, titleRomaji: "Um Encontro Inesperado" },
      { number: 3, titleRomaji: "Novos Horizontes" },
      { number: 4, titleRomaji: "O Último Confronto" },
    ]);
    await prisma.$disconnect();
  });

  test("todos os episódios da obra aparecem em ordem, sem seletor de temporada interna", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    await waitEpisodesStreamed(page); // a lista chega em streaming: espera o esqueleto sumir e a troca terminar
    await page.getByTestId("episode-toggle").click(); // a lista de episódios vem minimizada
    for (const n of [1, 2, 3, 4]) await expect(page.getByTestId(`episode-tile-1-${n}`)).toBeVisible();
    await expect(page.getByLabel("Temporada")).toHaveCount(0);
  });

  test("a busca filtra por título", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    await waitEpisodesStreamed(page);
    await page.getByTestId("episode-toggle").click();

    await page.getByPlaceholder("Buscar episódio...").fill("encontro");
    await expect(page.getByTestId("episode-tile-1-2")).toBeVisible();
    await expect(page.getByTestId("episode-tile-1-1")).toHaveCount(0);

    await page.getByPlaceholder("Buscar episódio...").fill("não existe episódio assim");
    await expect(page.getByText("Nenhum episódio bate com essa busca.")).toBeVisible();
  });

  test("sinopse do episódio aparece quando existe", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    await waitEpisodesStreamed(page);
    await page.getByTestId("episode-toggle").click();

    const tile = page.getByTestId("episode-tile-1-1");
    // Sinopse atrás de ação explícita (spoiler, D-09): oculta até pedir.
    await expect(tile.getByText("Resumo do episódio 1.")).toHaveCount(0);
    await tile.getByRole("button", { name: /Mostrar sinopse/ }).click();
    await expect(tile.getByText("Resumo do episódio 1.")).toBeVisible();
  });
});

// Achado real da revisão de código deste redesenho: o EpisodeGrid não remonta quando os `episodes` da página mudam (ex.:
// depois de uma ação que só chama router.refresh(), sem navegar). Um episódio novo que chega assim já aparece na lista.
test.describe("Lista de episódios — episódio novo chega sem remontar", () => {
  const SINGLE_ANILIST_ID = 901201;
  let animeId: string;
  const title = "Anime Que Ganha Um Episodio Novo Sem Remontar";

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: SINGLE_ANILIST_ID } },
      create: { userId: user.id, anilistId: SINGLE_ANILIST_ID, titleRomaji: title, episodes: 10, genres: "" },
      update: {},
    });
    animeId = anime.id;
    await seedGlobalEpisodes(prisma, SINGLE_ANILIST_ID, { titleRomaji: title }, [
      { number: 1, titleRomaji: "Primeiro Episódio" },
      { number: 2, titleRomaji: "Segundo Episódio" },
    ]);
    await prisma.$disconnect();
  });

  test("um episódio novo chegando via router.refresh() (sem navegação) já aparece na lista", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    await waitEpisodesStreamed(page);
    await page.getByTestId("episode-toggle").click();
    await expect(page.getByTestId("episode-tile-1-1")).toBeVisible();
    await expect(page.getByTestId("episode-tile-1-3")).toHaveCount(0);

    // Insere o episódio direto no banco, por fora da página — simula o que "Atualizar dados" faria.
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await seedGlobalEpisodes(prisma, SINGLE_ANILIST_ID, { titleRomaji: title }, [{ number: 3, titleRomaji: "Episódio Novo" }], { replace: false });
    await prisma.$disconnect();

    // Favoritar chama router.refresh() sem navegar — o mesmo tipo de atualização "in-place".
    await page.getByRole("button", { name: "Adicionar aos favoritos" }).click();
    await expect(page.getByTestId("episode-tile-1-3")).toBeVisible();
    await expect(page.getByTestId("episode-tile-1-1")).toBeVisible();
  });
});
