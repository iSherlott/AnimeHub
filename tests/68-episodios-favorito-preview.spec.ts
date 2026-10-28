import { test, expect } from "@playwright/test";
import { waitEpisodesStreamed } from "./streaming";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { seedGlobalEpisodes } from "./global-episodes";
import { TEST_USER_EMAIL } from "./test-auth";

// Lista de episódios com data de lançamento, sinopse e imagem (calendário) + favorito sobre a imagem no preview.
const ANILIST_ID = 968001;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

test.describe("Episódios: data, sinopse e imagem", () => {
  let prisma: PrismaClient;
  let animeId: string;
  const ep3At = new Date("2026-10-19T13:00:00Z");

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: ANILIST_ID } },
      create: { userId: user.id, anilistId: ANILIST_ID, titleRomaji: "Episodios Round68", genres: "", coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover-68.jpg" },
      update: {},
    });
    animeId = anime.id;
    // Episódios globais (Fase 4): a AniList dá dia e hora dos 3; a Kitsu completou título, sinopse e imagem do EP1 e o
    // título do EP2; o 3º ainda não tem nada além do horário. Imagem do EP2 capturada pelo agente.
    await seedGlobalEpisodes(prisma, ANILIST_ID, { titleRomaji: "Episodios Round68" }, [
      { number: 1, titleRomaji: "Primeiro", synopsis: "Sinopse do primeiro episódio.", thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/ep1-68.jpg", airingAt: new Date("2026-10-05T13:00:00Z") },
      { number: 2, titleRomaji: "Segundo", airingAt: new Date("2026-10-12T13:00:00Z") },
      { number: 3, airingAt: ep3At },
    ]);
    await prisma.episodeImage.upsert({
      where: { anilistId_episode: { anilistId: ANILIST_ID, episode: 2 } },
      create: { anilistId: ANILIST_ID, episode: 2, thumbnail: "https://s4.anilist.co/file/anilistcdn/media/anime/ep2-68.jpg" },
      update: {},
    });
  });

  test.afterAll(async () => {
    await prisma.anime.deleteMany({ where: { anilistId: ANILIST_ID } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: ANILIST_ID } });
    await prisma.episodeImage.deleteMany({ where: { anilistId: ANILIST_ID } });
    await prisma.$disconnect();
  });

  test("cada episódio mostra o lançamento, a sinopse (ou a falta dela) e a imagem; episódios só do calendário também entram", async ({ page }) => {
    await page.route(/s4\.anilist\.co/, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
    await page.goto(`/anime/${animeId}`);
    await waitEpisodesStreamed(page); // a lista chega em streaming: espera o esqueleto sumir e a troca terminar
    await page.getByTestId("episode-toggle").click(); // a lista de episódios vem minimizada

    // EP1: data da Kitsu (dia) + horário do calendário; sinopse atrás do aviso de spoiler.
    const ep1 = page.getByTestId("episode-tile-1-1");
    await expect(page.getByTestId("episode-release-1-1")).toContainText("Lançamento: 05 out 2026");
    await ep1.getByRole("button", { name: /Mostrar sinopse/ }).click();
    await expect(ep1).toContainText("Sinopse do primeiro episódio.");

    // EP2: sem sinopse e sem data da Kitsu → data do calendário e imagem capturada pelo agente.
    const ep2 = page.getByTestId("episode-tile-1-2");
    await expect(page.getByTestId("episode-release-1-2")).toContainText("Lançamento: 12 out 2026");
    await expect(ep2).toContainText("Sem sinopse disponível para este episódio.");
    await expect(ep2.locator("img").first()).toHaveAttribute("src", /ep2-68\.jpg/);

    // EP3: só existe no calendário — entra na lista com a data e a imagem do anime.
    const ep3 = page.getByTestId("episode-tile-1-3");
    await expect(ep3).toBeVisible();
    await expect(page.getByTestId("episode-release-1-3")).toContainText("Lançamento: 19 out 2026");
    await expect(ep3.locator("img").first()).toHaveAttribute("src", /cover-68\.jpg/);
  });
});

test.describe("Preview do calendário: Acompanhando sobre a imagem", () => {
  test("o botão Acompanhando fica no canto superior direito, sobreposto à imagem", async ({ page }) => {
    await page.route(/s4\.anilist\.co/, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
    const at = new Date();
    at.setHours(15, 0, 0, 0);
    await page.route("**/api/calendar**", (route) =>
      route.fulfill({
        json: {
          results: [
            {
              key: "968002-1", anilistId: 968002, animeId: "a968002", episode: 1, airingAt: at.toISOString(),
              titleRomaji: "Favorito Round68", titleEnglish: null, titleNative: null, titlePortuguese: null,
              coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover-fav.jpg", episodeImage: null, genres: [],
              inMyList: true, description: "Sinopse.", descriptionPortuguese: null, isFavorite: false, delayed: false,
            },
          ],
          offGrid: [],
        },
      })
    );
    await page.goto("/calendar");
    await page.getByRole("button", { name: /Favorito Round68/ }).hover();
    const preview = page.getByTestId("calendar-preview");
    await expect(preview).toBeVisible();
    const star = preview.getByTestId("preview-follow-toggle");
    await expect(star).toBeVisible();

    const box = (await preview.boundingBox())!;
    const starBox = (await star.boundingBox())!;
    // Dentro da faixa da imagem (180 px do topo) e encostado à direita.
    expect(starBox.y - box.y).toBeLessThan(24);
    expect(box.x + box.width - (starBox.x + starBox.width)).toBeLessThan(24);
    // E de fato sobreposto à imagem (não na fileira de ações lá embaixo).
    expect(starBox.y + starBox.height - box.y).toBeLessThan(180);
  });
});
