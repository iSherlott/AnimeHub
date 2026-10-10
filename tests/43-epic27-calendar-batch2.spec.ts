import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";
import { todayAtNoonSaoPaulo as todayAtNoon } from "./test-time";

// anilistId fora da faixa usada por outras fixtures.
const OWNED_ANILIST_ID = 903000;
const OTHER_ANILIST_ID = 903001;

test.describe("Epic 27 (lote 2) — calendário: card único + preview no hover", () => {
  let ownedAnimeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });

    const owned = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: OWNED_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: OWNED_ANILIST_ID,
        titleRomaji: "Anime Do Calendario Que Esta Na Lista",
        description: "<p>Sinopse original em inglês do calendário.</p>",
        descriptionPortuguese: null,
        isFavorite: false,
        genres: "",
      },
      update: {
        description: "<p>Sinopse original em inglês do calendário.</p>",
        descriptionPortuguese: null,
        isFavorite: false,
      },
    });
    ownedAnimeId = owned.id;

    await prisma.airingScheduleEntry.deleteMany({
      where: { anilistId: { in: [OWNED_ANILIST_ID, OTHER_ANILIST_ID] } },
    });
    await prisma.airingScheduleEntry.createMany({
      data: [
        {
          anilistId: OWNED_ANILIST_ID,
          episode: 5,
          airingAt: todayAtNoon(),
          titleRomaji: "Anime Do Calendario Que Esta Na Lista",
        },
        {
          anilistId: OTHER_ANILIST_ID,
          episode: 3,
          airingAt: todayAtNoon(),
          titleRomaji: "Anime Do Calendario Fora Da Lista",
        },
      ],
    });

    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    // Desfaz o favorito, caso algum teste tenha marcado — não deixa
    // rastro pra outros arquivos que também leem esse mesmo usuário.
    await prisma.anime.update({ where: { id: ownedAnimeId }, data: { isFavorite: false } });
    await prisma.$disconnect();
  });

  test("bloco da própria lista tem a barra lateral de destaque (acento) e o de fora a barra neutra", async ({ page }) => {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();

    const mineLink = page.getByRole("link", { name: "Anime Do Calendario Que Esta Na Lista" });
    const otherLink = page.getByRole("link", { name: "Anime Do Calendario Fora Da Lista" });
    await expect(mineLink).toBeVisible();
    await expect(otherLink).toBeVisible();

    // Figma 8:2181: todo bloco tem barra lateral de 3 px; o da lista usa o acento, o demais a borda neutra.
    await expect(mineLink).toHaveCSS("border-left-width", "3px");
    await expect(otherLink).toHaveCSS("border-left-width", "3px");
    await expect(mineLink).toHaveCSS("border-left-color", "rgb(255, 22, 79)");
    await expect(otherLink).toHaveCSS("border-left-color", "rgb(39, 40, 50)");
  });

  test("hover num item da lista mostra sinopse e botão de favoritar, que funciona de verdade", async ({
    page,
    request,
  }) => {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();

    const mineLink = page.getByRole("link", { name: "Anime Do Calendario Que Esta Na Lista" });
    await mineLink.hover();

    await expect(page.getByText("Sinopse original em inglês do calendário.")).toBeVisible();
    const favoriteButton = page.getByRole("button", { name: "Adicionar aos favoritos" });
    await expect(favoriteButton).toBeVisible();
    await favoriteButton.click();
    await expect(page.getByRole("button", { name: "Remover dos favoritos" })).toBeVisible();

    const res = await request.get("/api/anime");
    const data = await res.json();
    const anime = data.animes.find((a: { id: string }) => a.id === ownedAnimeId);
    expect(anime.isFavorite).toBe(true);
  });

  test("hover num item de fora da lista mostra 'ver mais detalhes' em vez de sinopse/favoritar", async ({
    page,
  }) => {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();

    const otherLink = page.getByRole("link", { name: "Anime Do Calendario Fora Da Lista" });
    await otherLink.hover();

    await expect(page.getByText("Sem sinopse — abra pra ver mais.")).toBeVisible();
    const seeMore = page.getByRole("link", { name: "Ver mais detalhes" });
    await expect(seeMore).toBeVisible();
    await expect(seeMore).toHaveAttribute("href", `/obra/${OTHER_ANILIST_ID}`);
    await expect(page.getByRole("button", { name: "Adicionar aos favoritos" })).toHaveCount(0);
  });

  test("descrição do preview acompanha o idioma escolhido, igual à página de detalhe", async ({
    page,
    request,
  }) => {
    await request.patch(`/api/anime/${ownedAnimeId}/description`, {
      data: { descriptionPortuguese: "Sinopse em português do calendário." },
    });

    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();

    // Preferência padrão "en" — ainda mostra a original.
    const mineLink = page.getByRole("link", { name: "Anime Do Calendario Que Esta Na Lista" });
    await mineLink.hover();
    await expect(page.getByText("Sinopse original em inglês do calendário.")).toBeVisible();
    await page.mouse.move(0, 0);

    // Idioma mora dentro do menu de conta pra quem está logado (esta
    // suíte sempre está) desde o lote 3 do Epic 27.
    await page.getByRole("button", { name: "Menu da conta" }).click();
    await page.getByRole("menuitem", { name: "PT" }).click();

    await mineLink.hover();
    await expect(page.getByText("Sinopse em português do calendário.")).toBeVisible();

    await request.patch(`/api/anime/${ownedAnimeId}/description`, {
      data: { descriptionPortuguese: null },
    });
  });
});
