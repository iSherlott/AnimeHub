import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

test.describe("Favoritar anime", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.findFirstOrThrow({ where: { userId: user.id } });
    animeId = anime.id;
    await prisma.$disconnect();
  });

  test("marca e desmarca como favorito", async ({ request }) => {
    const res = await request.patch(`/api/anime/${animeId}/favorite`, {
      data: { isFavorite: true },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.anime.isFavorite).toBe(true);
    expect(data.anime.favoritedAt).toBeTruthy();

    const res2 = await request.patch(`/api/anime/${animeId}/favorite`, {
      data: { isFavorite: false },
    });
    expect(res2.status()).toBe(200);
    const data2 = await res2.json();
    expect(data2.anime.isFavorite).toBe(false);
    expect(data2.anime.favoritedAt).toBeNull();
  });

  test("anime inexistente retorna 404", async ({ request }) => {
    const res = await request.patch("/api/anime/does-not-exist/favorite", {
      data: { isFavorite: true },
    });
    expect(res.status()).toBe(404);
  });

  test("outro usuário não consegue favoritar o anime de alguém", async ({ request }) => {
    const res = await request.patch(`/api/anime/${animeId}/favorite`, {
      data: { isFavorite: true },
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    expect(res.status()).toBe(404);
  });
});

test.describe("Favoritar exige login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("PATCH /api/anime/:id/favorite retorna 401 sem sessão", async ({ request }) => {
    const res = await request.patch("/api/anime/anything/favorite", {
      data: { isFavorite: true },
    });
    expect(res.status()).toBe(401);
  });
});
