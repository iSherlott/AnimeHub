import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const FAVORITED_ANILIST_ID = 911002;
const LONG_CAPTION_ANILIST_ID = 911003;

test.describe("Epic 27 (lote 3) — destaque de post sobre anime favoritado", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: FAVORITED_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: FAVORITED_ANILIST_ID,
        titleRomaji: "Anime Lote3 Favoritado Pro Post",
        isFavorite: true,
        genres: "",
      },
      update: { isFavorite: true },
    });
    animeId = anime.id;
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.anime.update({ where: { id: animeId }, data: { isFavorite: false } });
    await prisma.$disconnect();
  });

  test("post sobre anime favoritado mostra o chip com estrela e cor de destaque", async ({ page, request }) => {
    const uniqueBody = `Post sobre favorito do lote 3 ${Date.now()}`;
    const create = await request.post(`/api/anime/${animeId}/posts`, { data: { body: uniqueBody } });
    const postId = (await create.json()).post.id;

    await page.goto("/");
    const card = page.getByTestId(`post-card-${postId}`);
    await expect(card).toBeVisible();
    await expect(card.getByText("Anime Lote3 Favoritado Pro Post")).toBeVisible();
    await expect(card.getByLabel("Anime favoritado")).toBeVisible();
  });
});

test.describe("Epic 27 (lote 3) — legenda de post com imagem", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: LONG_CAPTION_ANILIST_ID } },
      create: { userId: user.id, anilistId: LONG_CAPTION_ANILIST_ID, titleRomaji: "Anime Lote3 Legenda Longa", genres: "" },
      update: {},
    });
    animeId = anime.id;
    await prisma.$disconnect();
  });

  test("legenda aparece logo depois da imagem, antes da linha de ações", async ({ page, request }) => {
    const uniqueBody = `Legenda curta reordenada ${Date.now()}`;
    const create = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: uniqueBody, imageUrls: ["https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-CXtrrkMpJ8Zq.jpg"] },
    });
    const postId = (await create.json()).post.id;

    await page.goto("/");
    const card = page.getByTestId(`post-card-${postId}`);
    await expect(card).toBeVisible();

    const captionBox = card.getByText(uniqueBody);
    const likeButton = card.getByRole("button", { name: /curtir/i }).first();
    const captionBoundingBox = await captionBox.boundingBox();
    const likeBoundingBox = await likeButton.boundingBox();
    expect(captionBoundingBox).not.toBeNull();
    expect(likeBoundingBox).not.toBeNull();
    // Legenda vem ANTES (mais acima na tela) da linha de ações.
    expect(captionBoundingBox!.y).toBeLessThan(likeBoundingBox!.y);
  });

  test("legenda longa trunca com 'ver mais' e expande ao clicar", async ({ page, request }) => {
    const longBody = `${"Legenda bem longa pra testar o truncamento. ".repeat(6)}${Date.now()}`;
    const create = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: longBody, imageUrls: ["https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-CXtrrkMpJ8Zq.jpg"] },
    });
    const postId = (await create.json()).post.id;

    await page.goto("/");
    const card = page.getByTestId(`post-card-${postId}`);
    await expect(card).toBeVisible();
    await expect(card.getByText(longBody)).toHaveCount(0);
    const seeMore = card.getByRole("button", { name: "ver mais" });
    await expect(seeMore).toBeVisible();
    await seeMore.click();
    await expect(card.getByText(longBody)).toBeVisible();
    await expect(card.getByRole("button", { name: "ver menos" })).toBeVisible();
  });
});

test.describe("Epic 27 (lote 3) — menu de conta (idioma + perfil + sair)", () => {
  test("usuário comum: abre com idioma/perfil/sair, sem 'Administração'", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Menu da conta" }).click();

    await expect(page.getByText("Idioma do título")).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Meu perfil" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Sair" })).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Administração" })).toHaveCount(0);
  });

  test("admin: menu de conta também mostra 'Administração'", async ({ page }) => {
    await page.context().addCookies([
      { name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/" },
    ]);
    await page.goto("/");
    await page.getByRole("button", { name: "Menu da conta" }).click();
    await expect(page.getByRole("menuitem", { name: "Administração" })).toBeVisible();
  });
});
