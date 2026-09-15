import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Terceira sessão fixa, só usada neste arquivo — pra testar "Seguindo"
// (alguém que o autor principal NÃO segue) e contagem de denúncias por
// pessoas distintas, mesmo padrão de tests/09-comments.spec.ts.
const THIRD_SESSION_TOKEN =
  "fee10000000000000000000000000000000000000000000000000000000001";
const THIRD_USER_EMAIL = "e2e-feed-third@test.local";

test.describe("Feed com posts, curtidas e seguir (Epic 22)", () => {
  let animeId: string; // linha de Anime do TEST_USER (autor principal, "A")
  let adminAnimeId: string; // linha de Anime do admin ("B"), mesmo anilistId
  let thirdAnimeId: string; // linha de Anime do terceiro usuário ("C")
  let userId: string;
  let adminUserId: string;
  let postId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    userId = user.id;
    const anime = await prisma.anime.findFirstOrThrow({ where: { userId: user.id } });
    animeId = anime.id;
    const anilistId = anime.anilistId;

    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-admin@test.local" } });
    adminUserId = admin.id;
    const adminAnime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: admin.id, anilistId } },
      create: { userId: admin.id, anilistId, titleRomaji: anime.titleRomaji },
      update: {},
    });
    adminAnimeId = adminAnime.id;

    const third = await prisma.user.upsert({
      where: { email: THIRD_USER_EMAIL },
      create: {
        email: THIRD_USER_EMAIL,
        passwordHash: "e2e-fixture-not-a-real-hash",
        passwordSalt: "e2e-fixture-not-a-real-salt",
        displayName: "E2E Feed Third User",
      },
      update: {},
    });
    await prisma.session.upsert({
      where: { token: THIRD_SESSION_TOKEN },
      create: {
        token: THIRD_SESSION_TOKEN,
        userId: third.id,
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
      update: {},
    });
    const thirdAnime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: third.id, anilistId } },
      create: { userId: third.id, anilistId, titleRomaji: anime.titleRomaji },
      update: {},
    });
    thirdAnimeId = thirdAnime.id;

    await prisma.$disconnect();
  });

  test("cria um post vinculado a um anime da própria lista, com isMine true", async ({ request }) => {
    const res = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "Temporada incrível, recomendo demais!" },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.post.body).toBe("Temporada incrível, recomendo demais!");
    expect(data.post.isMine).toBe(true);
    expect(data.post.likeCount).toBe(0);
    expect(data.post.likedByMe).toBe(false);
    expect(typeof data.post.animeTitleRomaji).toBe("string");
    postId = data.post.id;
  });

  test("rejeita post vazio", async ({ request }) => {
    const res = await request.post(`/api/anime/${animeId}/posts`, { data: { body: "   " } });
    expect(res.status()).toBe(400);
  });

  test("rejeita post maior que 500 caracteres", async ({ request }) => {
    const res = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "a".repeat(501) },
    });
    expect(res.status()).toBe(400);
  });

  test("rejeita URL de imagem inválida e aceita uma válida", async ({ request }) => {
    const invalid = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "post com imagem quebrada", imageUrl: "não-é-uma-url" },
    });
    expect(invalid.status()).toBe(400);

    const valid = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "post com imagem", imageUrl: "https://example.com/meme.png" },
    });
    expect(valid.status()).toBe(201);
    const data = await valid.json();
    expect(data.post.imageUrl).toBe("https://example.com/meme.png");
  });

  test("anime que não é meu retorna 404 ao postar", async ({ request }) => {
    const res = await request.post("/api/anime/does-not-exist/posts", { data: { body: "oi" } });
    expect(res.status()).toBe(404);
  });

  test("curtir é idempotente e reflete no likeCount", async ({ request }) => {
    const first = await request.patch(`/api/posts/${postId}/like`, { data: { liked: true } });
    expect(first.status()).toBe(200);
    const firstData = await first.json();
    expect(firstData).toEqual({ liked: true, likeCount: 1 });

    const again = await request.patch(`/api/posts/${postId}/like`, { data: { liked: true } });
    const againData = await again.json();
    expect(againData.likeCount).toBe(1);
  });

  test("descurtir volta o likeCount, idempotente também", async ({ request }) => {
    const res = await request.patch(`/api/posts/${postId}/like`, { data: { liked: false } });
    const data = await res.json();
    expect(data).toEqual({ liked: false, likeCount: 0 });

    const again = await request.patch(`/api/posts/${postId}/like`, { data: { liked: false } });
    expect((await again.json()).likeCount).toBe(0);
  });

  test("seguir a si mesmo retorna 400", async ({ request }) => {
    const res = await request.patch(`/api/users/${userId}/follow`, { data: { following: true } });
    expect(res.status()).toBe(400);
  });

  test("seguir outro usuário incrementa followerCount", async ({ request }) => {
    const res = await request.patch(`/api/users/${adminUserId}/follow`, {
      data: { following: true },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.following).toBe(true);
    expect(data.followerCount).toBeGreaterThanOrEqual(1);
  });

  test("aba Seguindo retorna só posts de quem eu sigo", async ({ request }) => {
    const fromFollowed = await request.post(`/api/anime/${adminAnimeId}/posts`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
      data: { body: "Post do admin, que eu sigo" },
    });
    expect(fromFollowed.status()).toBe(201);
    const followedPostId = (await fromFollowed.json()).post.id;

    const fromNotFollowed = await request.post(`/api/anime/${thirdAnimeId}/posts`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${THIRD_SESSION_TOKEN}` },
      data: { body: "Post do terceiro usuário, que eu NÃO sigo" },
    });
    expect(fromNotFollowed.status()).toBe(201);
    const notFollowedPostId = (await fromNotFollowed.json()).post.id;

    const feed = await request.get("/api/posts?tab=following");
    expect(feed.status()).toBe(200);
    const feedData = await feed.json();
    const ids = feedData.posts.map((p: { id: string }) => p.id);
    expect(ids).toContain(followedPostId);
    expect(ids).not.toContain(notFollowedPostId);
  });

  test("aba Recomendado ordena por pontuação, não só cronológico", async ({ request }) => {
    const fresh = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "Post fresco, sem curtidas" },
    });
    const freshPostId = (await fresh.json()).post.id;

    const old = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "Post mais velho, mas curtido" },
    });
    const oldPostId = (await old.json()).post.id;

    // Recua createdAt em 2h e soma 2 curtidas (admin + terceiro) — o
    // suficiente, pela fórmula de gravidade, pra superar um post recém
    // criado e sem nenhuma curtida (prova que não é só cronológico).
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.post.update({
      where: { id: oldPostId },
      data: { createdAt: new Date(Date.now() - 2 * 3_600_000) },
    });
    await prisma.$disconnect();

    await request.patch(`/api/posts/${oldPostId}/like`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
      data: { liked: true },
    });
    await request.patch(`/api/posts/${oldPostId}/like`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${THIRD_SESSION_TOKEN}` },
      data: { liked: true },
    });

    const feed = await request.get("/api/posts?tab=recommended");
    const feedData = await feed.json();
    const ids = feedData.posts.map((p: { id: string }) => p.id);
    const oldIndex = ids.indexOf(oldPostId);
    const freshIndex = ids.indexOf(freshPostId);
    expect(oldIndex).toBeGreaterThanOrEqual(0);
    expect(freshIndex).toBeGreaterThanOrEqual(0);
    expect(oldIndex).toBeLessThan(freshIndex);
  });

  test("paginação retorna páginas sem sobreposição até acabar", async ({ request }) => {
    const first = await request.get("/api/posts?tab=recommended&limit=2");
    const firstData = await first.json();
    expect(firstData.posts.length).toBe(2);
    expect(firstData.nextOffset).toBe(2);

    const second = await request.get("/api/posts?tab=recommended&limit=2&offset=2");
    const secondData = await second.json();
    expect(secondData.posts.length).toBeGreaterThan(0);

    const firstIds = new Set(firstData.posts.map((p: { id: string }) => p.id));
    const overlap = secondData.posts.some((p: { id: string }) => firstIds.has(p.id));
    expect(overlap).toBe(false);
  });

  test("duas pessoas diferentes denunciando o mesmo post contam como 2 na fila do admin", async ({
    request,
  }) => {
    const reportByAdmin = await request.post(`/api/posts/${postId}/report`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    expect(reportByAdmin.status()).toBe(201);

    const reportAgain = await request.post(`/api/posts/${postId}/report`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    expect(reportAgain.status()).toBe(201);

    const reportByThird = await request.post(`/api/posts/${postId}/report`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${THIRD_SESSION_TOKEN}` },
    });
    expect(reportByThird.status()).toBe(201);

    const queue = await request.get("/api/admin/post-reports", {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    expect(queue.status()).toBe(200);
    const queueData = await queue.json();
    const entry = queueData.reports.find((r: { postId: string }) => r.postId === postId);
    expect(entry).toBeTruthy();
    expect(entry.reportCount).toBe(2);
  });

  test("não-admin não acessa a fila de denúncias de post", async ({ request }) => {
    const res = await request.get("/api/admin/post-reports");
    expect(res.status()).toBe(403);
  });

  test("admin resolve com 'manter' — some da fila mas o post continua visível", async ({ request }) => {
    const res = await request.post(`/api/admin/post-reports/${postId}/resolve`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
      data: { action: "keep" },
    });
    expect(res.status()).toBe(200);

    const queue = await request.get("/api/admin/post-reports", {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    const queueData = await queue.json();
    expect(queueData.reports.find((r: { postId: string }) => r.postId === postId)).toBeFalsy();

    const stillThere = await request.get("/api/posts?tab=recommended&limit=100");
    const stillThereData = await stillThere.json();
    expect(stillThereData.posts.some((p: { id: string }) => p.id === postId)).toBe(true);
  });

  test("denunciar de novo depois de resolvido reabre a entrada na fila do admin", async ({ request }) => {
    const reReport = await request.post(`/api/posts/${postId}/report`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    expect(reReport.status()).toBe(201);

    const queue = await request.get("/api/admin/post-reports", {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    const queueData = await queue.json();
    const entry = queueData.reports.find((r: { postId: string }) => r.postId === postId);
    expect(entry).toBeTruthy();
    expect(entry.reportCount).toBe(1);

    // Deixa resolvido de novo pra não vazar denúncia pendente pros
    // próximos testes.
    await request.post(`/api/admin/post-reports/${postId}/resolve`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
      data: { action: "keep" },
    });
  });

  test("outro usuário não consegue apagar o post de alguém", async ({ request }) => {
    const create = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "Post pra testar exclusão indevida" },
    });
    const created = await create.json();

    const del = await request.delete(`/api/posts/${created.post.id}`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    expect(del.status()).toBe(404);
  });

  test("autor apaga o próprio post", async ({ request }) => {
    const del = await request.delete(`/api/posts/${postId}`);
    expect(del.status()).toBe(200);

    const feed = await request.get("/api/posts?tab=recommended&limit=100");
    const feedData = await feed.json();
    expect(feedData.posts.some((p: { id: string }) => p.id === postId)).toBe(false);
  });

  test("perfil público de outro usuário reflete followerCount/postCount", async ({ request }) => {
    const res = await request.get(`/api/users/${adminUserId}`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.user.isFollowedByMe).toBe(true);
    expect(data.user.postCount).toBeGreaterThanOrEqual(1);
  });
});

test.describe("Feed exige login pra interagir, mas leitura e perfis públicos ficam abertos", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("POST /api/anime/:id/posts retorna 401 sem sessão", async ({ request }) => {
    const res = await request.post("/api/anime/anything/posts", { data: { body: "oi" } });
    expect(res.status()).toBe(401);
  });

  // Redesenho do Feed (Instagram/Twitter): a leitura de "Recomendado" (a
  // aba padrão) é pública, igual Descobrir/Calendário já eram — só
  // "Seguindo" (que não existe sem conta) continua exigindo login.
  test("GET /api/posts (recommended, padrão) funciona sem sessão", async ({ request }) => {
    const res = await request.get("/api/posts");
    expect(res.status()).toBe(200);
  });

  test("GET /api/posts?tab=following retorna 401 sem sessão", async ({ request }) => {
    const res = await request.get("/api/posts?tab=following");
    expect(res.status()).toBe(401);
  });

  test("DELETE /api/posts/:id retorna 401 sem sessão", async ({ request }) => {
    const res = await request.delete("/api/posts/anything");
    expect(res.status()).toBe(401);
  });

  test("PATCH /api/posts/:id/like retorna 401 sem sessão", async ({ request }) => {
    const res = await request.patch("/api/posts/anything/like", { data: { liked: true } });
    expect(res.status()).toBe(401);
  });

  test("POST /api/posts/:id/report retorna 401 sem sessão", async ({ request }) => {
    const res = await request.post("/api/posts/anything/report");
    expect(res.status()).toBe(401);
  });

  test("PATCH /api/users/:id/follow retorna 401 sem sessão", async ({ request }) => {
    const res = await request.patch("/api/users/anything/follow", { data: { following: true } });
    expect(res.status()).toBe(401);
  });

  test("GET /api/admin/post-reports retorna 401 sem sessão", async ({ request }) => {
    const res = await request.get("/api/admin/post-reports");
    expect(res.status()).toBe(401);
  });

  test("GET /api/users/:id e /api/users/:id/posts funcionam sem sessão (200)", async ({ request }) => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    await prisma.$disconnect();

    const profile = await request.get(`/api/users/${user.id}`);
    expect(profile.status()).toBe(200);
    const profileData = await profile.json();
    expect(profileData.user.isFollowedByMe).toBe(false);

    const posts = await request.get(`/api/users/${user.id}/posts`);
    expect(posts.status()).toBe(200);
  });
});
