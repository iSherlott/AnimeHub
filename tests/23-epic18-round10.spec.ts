import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL, TEST_ADMIN_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const FAVORITE_ANILIST_ID = 901000;

test.describe("Epic 18 — 10ª rodada de auditoria de UX/UI — booleanos rejeitam valor não-booleano", () => {
  let animeId: string;
  let adminUserId: string;
  let postId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } });
    adminUserId = admin.id;

    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: FAVORITE_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: FAVORITE_ANILIST_ID,
        titleRomaji: "Anime Pra Testar Booleano Coagido",
        genres: "",
        isFavorite: false,
      },
      update: { isFavorite: false },
    });
    animeId = anime.id;

    await prisma.postLike.deleteMany({ where: { post: { userId: user.id, body: "Round10 like coercion test" } } });
    await prisma.post.deleteMany({ where: { userId: user.id, body: "Round10 like coercion test" } });
    const post = await prisma.post.create({
      data: {
        userId: user.id,
        anilistId: FAVORITE_ANILIST_ID,
        animeTitleRomaji: "Anime Pra Testar Booleano Coagido",
        body: "Round10 like coercion test",
      },
    });
    postId = post.id;

    await prisma.follow.deleteMany({ where: { followerId: user.id, followingId: adminUserId } });

    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.postLike.deleteMany({ where: { postId } });
    await prisma.post.delete({ where: { id: postId } }).catch(() => {});
    await prisma.$disconnect();
  });

  // Boolean(x) aceitava qualquer valor "truthy" (a string "false", um array
  // vazio) como true em vez de rejeitar o que não é booleano de verdade
  // (achado real da 10ª rodada de auditoria, Epic 18).
  test("PATCH favorite com isFavorite: \"false\" (string) é rejeitado, não vira true", async ({ request }) => {
    const res = await request.patch(`/api/anime/${animeId}/favorite`, {
      data: { isFavorite: "false" },
    });
    expect(res.status()).toBe(400);

    const check = await request.get("/api/anime");
    const data = await check.json();
    const anime = data.animes.find((a: { id: string }) => a.id === animeId);
    expect(anime.isFavorite).toBe(false);
  });

  test("PATCH favorite com booleano de verdade continua funcionando", async ({ request }) => {
    const res = await request.patch(`/api/anime/${animeId}/favorite`, {
      data: { isFavorite: true },
    });
    expect(res.ok()).toBe(true);
    const data = await res.json();
    expect(data.anime.isFavorite).toBe(true);
  });

  test("PATCH like com liked: [] (array vazio) é rejeitado, não vira true", async ({ request }) => {
    const res = await request.patch(`/api/posts/${postId}/like`, {
      data: { liked: [] },
    });
    expect(res.status()).toBe(400);
  });

  test("PATCH follow com following: \"yes\" (string) é rejeitado", async ({ request }) => {
    const res = await request.patch(`/api/users/${adminUserId}/follow`, {
      data: { following: "yes" },
    });
    expect(res.status()).toBe(400);
  });
});
