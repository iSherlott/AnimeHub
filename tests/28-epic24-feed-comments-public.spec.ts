import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const ANILIST_ID = 900801;
const ANON_ANILIST_ID = 900802;

test.describe("Epic 24 — comentário por post (usuário logado)", () => {
  let animeId: string;
  let postId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: ANILIST_ID } },
      create: { userId: user.id, anilistId: ANILIST_ID, titleRomaji: "Anime Epic 24 Comments Test", genres: "" },
      update: {},
    });
    animeId = anime.id;
    await prisma.$disconnect();
  });

  test("cria o post usado pelo resto do arquivo", async ({ request }) => {
    const res = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "Post pra testar comentário público (Epic 24)" },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.post.commentCount).toBe(0);
    postId = data.post.id;
  });

  test("autor comenta, aparece na listagem e no commentCount do feed", async ({ request }) => {
    const create = await request.post(`/api/posts/${postId}/comments`, {
      data: { body: "Primeiro comentário de verdade" },
    });
    expect(create.status()).toBe(201);
    const comment = (await create.json()).comment;
    expect(comment.isMine).toBe(true);

    const list = await request.get(`/api/posts/${postId}/comments`);
    const listData = await list.json();
    expect(listData.comments.map((c: { id: string }) => c.id)).toContain(comment.id);

    const feed = await request.get("/api/posts?tab=recommended&limit=100");
    const feedData = await feed.json();
    const post = feedData.posts.find((p: { id: string }) => p.id === postId);
    expect(post.commentCount).toBe(1);

    await request.delete(`/api/posts/${postId}/comments/${comment.id}`);
  });

  // Achado real de verificação ao vivo: _count.comments sem filtro contava
  // comentários apagados (soft delete) — um comentário apagado continuava
  // inflando o número mostrado no card.
  test("comentário apagado não conta em commentCount nem aparece na listagem", async ({ request }) => {
    const create = await request.post(`/api/posts/${postId}/comments`, {
      data: { body: "Comentário que vai ser apagado" },
    });
    const comment = (await create.json()).comment;

    const del = await request.delete(`/api/posts/${postId}/comments/${comment.id}`);
    expect(del.status()).toBe(200);

    const list = await request.get(`/api/posts/${postId}/comments`);
    const listData = await list.json();
    expect(listData.comments.map((c: { id: string }) => c.id)).not.toContain(comment.id);

    const feed = await request.get("/api/posts?tab=recommended&limit=100");
    const feedData = await feed.json();
    const post = feedData.posts.find((p: { id: string }) => p.id === postId);
    expect(post.commentCount).toBe(0);
  });

  test("outra pessoa não consegue apagar o comentário de alguém", async ({ request }) => {
    const create = await request.post(`/api/posts/${postId}/comments`, {
      data: { body: "Comentário protegido contra exclusão indevida" },
    });
    const comment = (await create.json()).comment;

    const badDelete = await request.delete(`/api/posts/${postId}/comments/${comment.id}`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    expect(badDelete.status()).toBe(404);

    const list = await request.get(`/api/posts/${postId}/comments`);
    const listData = await list.json();
    expect(listData.comments.map((c: { id: string }) => c.id)).toContain(comment.id);
  });
});

test.describe("Epic 24 — Feed público (sem sessão)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let postId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: ANON_ANILIST_ID } },
      create: { userId: user.id, anilistId: ANON_ANILIST_ID, titleRomaji: "Anime Epic 24 Anon Test", genres: "" },
      update: {},
    });
    const post = await prisma.post.create({
      data: {
        userId: user.id,
        anilistId: anime.anilistId,
        animeTitleRomaji: anime.titleRomaji,
        body: "Post público visível sem login (Epic 24)",
      },
    });
    postId = post.id;
    await prisma.$disconnect();
  });

  // Sistema fechado (28/10): ler os comentários também exige conta.
  test("GET e POST de comentários exigem login", async ({ request }) => {
    const anonGet = await request.get(`/api/posts/${postId}/comments`);
    expect(anonGet.status()).toBe(401);

    const anonPost = await request.post(`/api/posts/${postId}/comments`, {
      data: { body: "tentativa sem login" },
    });
    expect(anonPost.status()).toBe(401);
  });

  test("apagar comentário de outra pessoa sem sessão retorna 401", async ({ request }) => {
    const res = await request.delete(`/api/posts/${postId}/comments/does-not-exist`);
    expect(res.status()).toBe(401);
  });

  test("sem sessão o Feed nem abre: vai direto ao login", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login\?next=%2F$/);
    await expect(page.locator('[data-testid^="post-card-"]')).toHaveCount(0);
  });
});
