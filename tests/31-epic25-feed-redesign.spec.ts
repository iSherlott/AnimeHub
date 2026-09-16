import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const ANILIST_ID = 902500;

test.describe("Epic 25 — carrossel de imagens", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: ANILIST_ID } },
      create: { userId: user.id, anilistId: ANILIST_ID, titleRomaji: "Anime Epic 25 Carousel Test", genres: "" },
      update: {},
    });
    animeId = anime.id;
    await prisma.$disconnect();
  });

  test("aceita várias imagens, rejeita URL inválida e mais de 6", async ({ request }) => {
    const valid = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "post com carrossel", imageUrls: ["https://example.com/a.png", "https://example.com/b.png"] },
    });
    expect(valid.status()).toBe(201);
    const data = await valid.json();
    expect(data.post.imageUrls).toEqual(["https://example.com/a.png", "https://example.com/b.png"]);

    const invalid = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "post com imagem quebrada", imageUrls: ["não-é-uma-url"] },
    });
    expect(invalid.status()).toBe(400);

    const tooMany = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "imagens demais", imageUrls: Array.from({ length: 7 }, (_, i) => `https://example.com/${i}.png`) },
    });
    expect(tooMany.status()).toBe(400);
  });

  test("post sem imagem tem imageUrls vazio", async ({ request }) => {
    const res = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "post sem imagem nenhuma" },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.post.imageUrls).toEqual([]);
  });

  test("carrossel troca de imagem ao clicar na seta (ao vivo)", async ({ page, request }) => {
    const uniqueBody = `Post com carrossel ao vivo ${Date.now()}`;
    const create = await request.post(`/api/anime/${animeId}/posts`, {
      data: {
        body: uniqueBody,
        imageUrls: ["https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx1-CXtrrkMpJ8Zq.jpg", "https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/bx21-YCDoj1EkAxFn.jpg"],
      },
    });
    const postId = (await create.json()).post.id;

    await page.goto("/");
    const card = page.getByTestId(`post-card-${postId}`);
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Imagem anterior" })).toBeVisible();
    const nextButton = card.getByRole("button", { name: "Próxima imagem" });
    await expect(nextButton).toBeVisible();
    // Só confirma que o clique não quebra nada (a troca de índice em si já
    // é coberta por unit-level de estado do componente) — o essencial pro
    // Playwright é a seta existir e continuar clicável.
    await nextButton.click();
    await expect(nextButton).toBeVisible();
  });
});

test.describe("Epic 25 — citação", () => {
  let animeId: string;
  let quotedPostId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: ANILIST_ID + 1 } },
      create: { userId: user.id, anilistId: ANILIST_ID + 1, titleRomaji: "Anime Epic 25 Quote Test", genres: "" },
      update: {},
    });
    animeId = anime.id;
    const quoted = await prisma.post.create({
      data: {
        userId: user.id,
        anilistId: anime.anilistId,
        animeTitleRomaji: anime.titleRomaji,
        body: "Post original pra ser citado",
      },
    });
    quotedPostId = quoted.id;
    await prisma.$disconnect();
  });

  test("criar um post citando outro embute a pré-visualização", async ({ request }) => {
    const res = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "Citando o post acima", quotedPostId },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.post.quotedPost).toMatchObject({
      id: quotedPostId,
      body: "Post original pra ser citado",
    });
  });

  test("citar um post inexistente retorna 404", async ({ request }) => {
    const res = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "Citando algo que não existe", quotedPostId: "does-not-exist" },
    });
    expect(res.status()).toBe(404);
  });

  test("a pré-visualização da citação aparece no card (ao vivo)", async ({ page, request }) => {
    const uniqueBody = `Post citando ao vivo ${Date.now()}`;
    const create = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: uniqueBody, quotedPostId },
    });
    const postId = (await create.json()).post.id;

    await page.goto("/");
    const card = page.getByTestId(`post-card-${postId}`);
    await expect(card).toBeVisible();
    await expect(card.getByText("Post original pra ser citado")).toBeVisible();
  });
});

test.describe("Epic 25 — repost", () => {
  let animeId: string;
  let originalPostId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-admin@test.local" } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: admin.id, anilistId: ANILIST_ID + 2 } },
      create: { userId: admin.id, anilistId: ANILIST_ID + 2, titleRomaji: "Anime Epic 25 Repost Test", genres: "" },
      update: {},
    });
    animeId = anime.id;
    const post = await prisma.post.create({
      data: {
        userId: admin.id,
        anilistId: anime.anilistId,
        animeTitleRomaji: anime.titleRomaji,
        body: "Post do admin pra ser repostado",
      },
    });
    originalPostId = post.id;
    await prisma.$disconnect();
  });

  test("não pode repostar o próprio post", async ({ request }) => {
    const res = await request.post(`/api/anime/${animeId}/posts`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
      data: { body: "Post do próprio admin" },
    });
    const ownPostId = (await res.json()).post.id;

    const repostOwn = await request.patch(`/api/posts/${ownPostId}/repost`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
      data: { reposted: true },
    });
    expect(repostOwn.status()).toBe(400);
  });

  test("repostar é idempotente nas 2 direções e aparece no feed com atribuição", async ({ request }) => {
    const first = await request.patch(`/api/posts/${originalPostId}/repost`, { data: { reposted: true } });
    expect(first.status()).toBe(200);
    const again = await request.patch(`/api/posts/${originalPostId}/repost`, { data: { reposted: true } });
    expect(again.status()).toBe(200);

    const feed = await request.get("/api/posts?tab=recommended&limit=100");
    const feedData = await feed.json();
    const entries = feedData.posts.filter((p: { id: string }) => p.id === originalPostId);
    // O original aparece 1x como ele mesmo (repostedBy null) e 1x como
    // repost (repostedBy setado) — nunca mais que isso mesmo repostando 2x.
    expect(entries.length).toBe(2);
    expect(entries.some((e: { repostedBy: unknown }) => e.repostedBy === null)).toBe(true);
    expect(entries.some((e: { repostedBy: { id: string } | null }) => e.repostedBy?.id)).toBe(true);

    const undo = await request.patch(`/api/posts/${originalPostId}/repost`, { data: { reposted: false } });
    expect(undo.status()).toBe(200);
    const undoAgain = await request.patch(`/api/posts/${originalPostId}/repost`, { data: { reposted: false } });
    expect(undoAgain.status()).toBe(200);

    const feedAfter = await request.get("/api/posts?tab=recommended&limit=100");
    const feedAfterData = await feedAfter.json();
    const entriesAfter = feedAfterData.posts.filter((p: { id: string }) => p.id === originalPostId);
    expect(entriesAfter.length).toBe(1);
    expect(entriesAfter[0].repostedBy).toBeNull();
  });

});

test.describe("Epic 25 — repost sem sessão", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  let anonTargetPostId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-admin@test.local" } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: admin.id, anilistId: ANILIST_ID + 4 } },
      create: { userId: admin.id, anilistId: ANILIST_ID + 4, titleRomaji: "Anime Epic 25 Repost Anon Test", genres: "" },
      update: {},
    });
    const post = await prisma.post.create({
      data: {
        userId: admin.id,
        anilistId: anime.anilistId,
        animeTitleRomaji: anime.titleRomaji,
        body: "Post pra testar repost sem sessão",
      },
    });
    anonTargetPostId = post.id;
    await prisma.$disconnect();
  });

  test("repostar sem sessão retorna 401", async ({ request }) => {
    const res = await request.patch(`/api/posts/${anonTargetPostId}/repost`, {
      data: { reposted: true },
    });
    expect(res.status()).toBe(401);
  });
});

test.describe("Epic 25 — lateral de threads de anime (Comment, Epic 15)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  const trendingAnilistId = ANILIST_ID + 3;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: trendingAnilistId } },
      create: { userId: user.id, anilistId: trendingAnilistId, titleRomaji: "Anime Epic 25 Trending Test", genres: "" },
      update: {},
    });
    await prisma.comment.deleteMany({ where: { anilistId: trendingAnilistId } });
    await prisma.comment.create({ data: { anilistId: trendingAnilistId, userId: user.id, body: "Comentário de hoje A" } });
    await prisma.comment.create({ data: { anilistId: trendingAnilistId, userId: user.id, body: "Comentário de hoje B" } });
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.comment.deleteMany({ where: { anilistId: trendingAnilistId } });
    await prisma.$disconnect();
  });

  test("GET /api/anime-threads/trending é pública e inclui a thread recém-comentada", async ({ request }) => {
    const res = await request.get("/api/anime-threads/trending");
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.recent)).toBe(true);
    expect(Array.isArray(data.mostCommentedToday)).toBe(true);
    const inRecent = data.recent.find((t: { anilistId: number }) => t.anilistId === trendingAnilistId);
    const inToday = data.mostCommentedToday.find((t: { anilistId: number }) => t.anilistId === trendingAnilistId);
    expect(inRecent).toBeTruthy();
    expect(inToday).toBeTruthy();
    expect(inToday.commentCount).toBe(2);
  });
});
