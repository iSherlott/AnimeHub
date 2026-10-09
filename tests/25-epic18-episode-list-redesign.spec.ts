import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const ANIME_ANILIST_ID = 901200;

test.describe("Redesenho da lista de episódios — seletor de temporada e busca", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });

    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: ANIME_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: ANIME_ANILIST_ID,
        titleRomaji: "Anime Com Duas Temporadas Pra Testar Lista De Episódios",
        genres: "",
      },
      update: {},
    });
    animeId = anime.id;

    // number é a posição absoluta dentro do anime, não reinicia por
    // temporada (@@unique([animeId, number]) no schema) — mesma observação
    // já registrada no comentário de EpisodeGrid sobre o cálculo de
    // ordinal.
    await prisma.episode.deleteMany({ where: { animeId } });
    await prisma.episode.createMany({
      data: [
        { animeId, number: 1, seasonNumber: 1, titleRomaji: "O Início Da Jornada", synopsis: "Resumo do episódio 1." },
        { animeId, number: 2, seasonNumber: 1, titleRomaji: "Um Encontro Inesperado" },
        { animeId, number: 3, seasonNumber: 2, titleRomaji: "Novos Horizontes" },
        { animeId, number: 4, seasonNumber: 2, titleRomaji: "O Último Confronto" },
      ],
    });

    await prisma.$disconnect();
  });

  test("mostra a última temporada por padrão, e trocar no seletor filtra a lista certa", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    // A lista de episódios vem atrás de um accordion fechado por padrão
    // desde o lote 1 do Epic 27 — precisa abrir antes de qualquer episódio
    // ficar visível.
    await page.getByText(/Ver episódios/).click();

    // Temporada 2 (a mais recente) vem selecionada por padrão.
    await expect(page.getByTestId("episode-tile-2-3")).toBeVisible();
    await expect(page.getByTestId("episode-tile-2-4")).toBeVisible();
    await expect(page.getByTestId("episode-tile-1-1")).toHaveCount(0);

    await page.getByLabel("Temporada").click();
    await page.getByRole("option", { name: "Temporada 1" }).click();

    await expect(page.getByTestId("episode-tile-1-1")).toBeVisible();
    await expect(page.getByTestId("episode-tile-1-2")).toBeVisible();
    await expect(page.getByTestId("episode-tile-2-3")).toHaveCount(0);
  });

  test("a busca filtra por título dentro da temporada selecionada", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    await page.getByText(/Ver episódios/).click();

    await page.getByLabel("Temporada").click();
    await page.getByRole("option", { name: "Temporada 1" }).click();

    await page.getByPlaceholder("Buscar episódio...").fill("encontro");
    await expect(page.getByTestId("episode-tile-1-2")).toBeVisible();
    await expect(page.getByTestId("episode-tile-1-1")).toHaveCount(0);

    await page.getByPlaceholder("Buscar episódio...").fill("não existe episódio assim");
    await expect(page.getByText("Nenhum episódio bate com essa busca.")).toBeVisible();
  });

  test("sinopse do episódio aparece quando existe", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    await page.getByText(/Ver episódios/).click();
    await page.getByLabel("Temporada").click();
    await page.getByRole("option", { name: "Temporada 1" }).click();

    const tile = page.getByTestId("episode-tile-1-1");
    // Sinopse atrás de ação explícita (spoiler, D-09): oculta até pedir.
    await expect(tile.getByText("Resumo do episódio 1.")).toHaveCount(0);
    await tile.getByRole("button", { name: /Mostrar sinopse/ }).click();
    await expect(tile.getByText("Resumo do episódio 1.")).toBeVisible();
  });
});

// Achado real da revisão de código deste redesenho: o seletor de temporada
// usava um useState inicializado 1 vez só a partir da temporada mais
// recente — como EpisodeGrid não remonta quando o `episodes` da página
// muda (ex.: depois de qualquer ação que só chama router.refresh(), sem
// navegar de verdade), um anime que começa com 1 só temporada e ganha uma
// 2ª depois ficava com o seletor escondido (ou, pior, visível mas
// mostrando um valor que não batia com a lista filtrada de verdade).
test.describe("Redesenho da lista de episódios — seletor reage a episódios novos sem remontar", () => {
  const SINGLE_SEASON_ANILIST_ID = 901201;
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });

    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: SINGLE_SEASON_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: SINGLE_SEASON_ANILIST_ID,
        titleRomaji: "Anime De 1 Temporada Que Ganha Uma 2ª Sem Remontar",
        episodes: 10,
        genres: "",
      },
      update: {},
    });
    animeId = anime.id;

    await prisma.episode.deleteMany({ where: { animeId } });
    await prisma.episode.createMany({
      data: [
        { animeId, number: 1, seasonNumber: 1, titleRomaji: "Primeiro Episódio" },
        { animeId, number: 2, seasonNumber: 1, titleRomaji: "Segundo Episódio" },
      ],
    });
    await prisma.$disconnect();
  });

  test("uma 2ª temporada chegando via router.refresh() (sem navegação) já aparece certa no seletor", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    await page.getByText(/Ver episódios/).click();

    // 1 temporada só — seletor nem aparece, e o EpisodeGrid já está
    // montado nesse estado (é essa mesma instância que não deve remontar
    // depois).
    await expect(page.getByLabel("Temporada")).toHaveCount(0);
    await expect(page.getByTestId("episode-tile-1-1")).toBeVisible();

    // Insere a 2ª temporada direto no banco, por fora da página — simula
    // o que "Atualizar dados" faria de verdade, sem depender de uma fonte
    // externa real neste teste.
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.episode.create({
      data: { animeId, number: 3, seasonNumber: 2, titleRomaji: "Episódio Da Temporada Nova" },
    });
    await prisma.$disconnect();

    // Favoritar chama router.refresh() sem navegar — o
    // mesmo tipo de atualização "in-place" que expôs o bug (EpisodeGrid
    // continua montado, só os `episodes` que chegam nele mudam).
    await page.getByRole("button", { name: "Adicionar aos favoritos" }).click();

    const seasonSelect = page.getByLabel("Temporada");
    await expect(seasonSelect).toBeVisible();
    await expect(seasonSelect).toHaveText("Temporada 2");
    await expect(page.getByTestId("episode-tile-2-3")).toBeVisible();
    await expect(page.getByTestId("episode-tile-1-1")).toHaveCount(0);
  });
});
