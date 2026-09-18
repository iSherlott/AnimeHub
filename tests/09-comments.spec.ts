import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// GET /api/anime/[id]/comments pagina em 10 por página (lote 1 do Epic 27)
// — a suíte inteira compartilha o mesmo anime entre vários arquivos de
// teste, então por essa altura já pode haver mais de 10 comentários
// acumulados e a página 1 sozinha não é mais garantia de conter um
// comentário específico recém-criado (que, por ordenação createdAt asc,
// sempre cai nas páginas mais recentes). Busca todas as páginas quando
// precisa achar 1 comentário específico em vez de assumir que cabe na 1ª.
async function fetchAllComments(request: APIRequestContext, url: string, headers?: Record<string, string>) {
  const first = await request.get(url, headers ? { headers } : undefined);
  const firstData = await first.json();
  const comments = [...(firstData.comments ?? [])];
  const totalPages = firstData.totalPages ?? 1;
  const sep = url.includes("?") ? "&" : "?";
  for (let p = 2; p <= totalPages; p++) {
    const res = await request.get(`${url}${sep}page=${p}`, headers ? { headers } : undefined);
    const data = await res.json();
    comments.push(...(data.comments ?? []));
  }
  return { status: first.status(), comments };
}

// Terceira sessão fixa, só usada neste arquivo — pra testar que a contagem
// de denúncias soma pessoas distintas (o admin sozinho já cobre "outro
// usuário vê/denuncia", mas não "duas denúncias contam como 2").
const THIRD_SESSION_TOKEN =
  "c0900000000000000000000000000000000000000000000000000000000001";
const THIRD_USER_EMAIL = "e2e-third@test.local";

test.describe("Comentários por anime (Epic 15)", () => {
  let animeId: string; // linha de Anime do TEST_USER
  let adminAnimeId: string; // linha de Anime do admin, mesmo anilistId
  let anilistId: number;
  let commentId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.findFirstOrThrow({ where: { userId: user.id } });
    animeId = anime.id;
    anilistId = anime.anilistId;

    // O admin também precisa ter esse mesmo anime na própria lista pra
    // poder ver/denunciar o comentário — comentário é visível por
    // anilistId, mas a API ainda exige posse da própria linha de Anime.
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-admin@test.local" } });
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
        displayName: "E2E Third User",
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
    await prisma.anime.upsert({
      where: { userId_anilistId: { userId: third.id, anilistId } },
      create: { userId: third.id, anilistId, titleRomaji: anime.titleRomaji },
      update: {},
    });

    await prisma.$disconnect();
  });

  test("cria um comentário e retorna com isMine true", async ({ request }) => {
    const res = await request.post(`/api/anime/${animeId}/comments`, {
      data: { body: "Que temporada incrível!" },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.comment.body).toBe("Que temporada incrível!");
    expect(data.comment.isMine).toBe(true);
    commentId = data.comment.id;
  });

  test("rejeita comentário vazio", async ({ request }) => {
    const res = await request.post(`/api/anime/${animeId}/comments`, { data: { body: "   " } });
    expect(res.status()).toBe(400);
  });

  test("outro usuário com o mesmo anime na lista vê o comentário, com isMine false", async ({
    request,
  }) => {
    const { status, comments } = await fetchAllComments(request, `/api/anime/${adminAnimeId}/comments`, {
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}`,
    });
    expect(status).toBe(200);
    const found = comments.find((c: { id: string }) => c.id === commentId);
    expect(found).toBeTruthy();
    expect(found.isMine).toBe(false);
    expect(found.author.displayName).toBe("E2E Test User");
  });

  test("anime inexistente retorna 404 tanto pra ler quanto pra comentar", async ({ request }) => {
    const getRes = await request.get("/api/anime/does-not-exist/comments");
    expect(getRes.status()).toBe(404);
    const postRes = await request.post("/api/anime/does-not-exist/comments", {
      data: { body: "oi" },
    });
    expect(postRes.status()).toBe(404);
  });

  test("duas pessoas diferentes denunciando o mesmo comentário contam como 2 na fila do admin", async ({
    request,
  }) => {
    const reportByAdmin = await request.post(`/api/comments/${commentId}/report`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    expect(reportByAdmin.status()).toBe(201);

    // Denunciar de novo pela mesma pessoa não deve duplicar.
    const reportAgain = await request.post(`/api/comments/${commentId}/report`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    expect(reportAgain.status()).toBe(201);

    const reportByThird = await request.post(`/api/comments/${commentId}/report`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${THIRD_SESSION_TOKEN}` },
    });
    expect(reportByThird.status()).toBe(201);

    const queue = await request.get("/api/admin/comment-reports", {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    expect(queue.status()).toBe(200);
    const queueData = await queue.json();
    const entry = queueData.reports.find((r: { commentId: string }) => r.commentId === commentId);
    expect(entry).toBeTruthy();
    expect(entry.reportCount).toBe(2);
  });

  test("não-admin não acessa a fila de denúncias", async ({ request }) => {
    const res = await request.get("/api/admin/comment-reports");
    expect(res.status()).toBe(403);
  });

  test("admin resolve com 'manter' — some da fila mas o comentário continua visível", async ({
    request,
  }) => {
    const res = await request.post(`/api/admin/comment-reports/${commentId}/resolve`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
      data: { action: "keep" },
    });
    expect(res.status()).toBe(200);

    const queue = await request.get("/api/admin/comment-reports", {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    const queueData = await queue.json();
    expect(queueData.reports.find((r: { commentId: string }) => r.commentId === commentId)).toBeFalsy();

    const { comments: stillThereComments } = await fetchAllComments(request, `/api/anime/${animeId}/comments`);
    expect(stillThereComments.some((c: { id: string }) => c.id === commentId)).toBe(true);
  });

  test("reportedByMe reflete uma denúncia própria em aberto, e some quando resolvida", async ({
    request,
  }) => {
    const { comments: afterResolveComments } = await fetchAllComments(request, `/api/anime/${adminAnimeId}/comments`, {
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}`,
    });
    expect(
      afterResolveComments.find((c: { id: string }) => c.id === commentId).reportedByMe
    ).toBe(false);
  });

  test("denunciar de novo depois de resolvido reabre a entrada na fila do admin", async ({
    request,
  }) => {
    // Regressão: o upsert de denúncia fazia um no-op em cima da linha já
    // resolvida (resolvedAt continuava setado), então a mesma pessoa nunca
    // mais conseguia reabrir a fila pra esse comentário depois da 1ª
    // resolução — mesmo a API respondendo 201 como se tivesse funcionado.
    const reReport = await request.post(`/api/comments/${commentId}/report`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    expect(reReport.status()).toBe(201);

    const queue = await request.get("/api/admin/comment-reports", {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    const queueData = await queue.json();
    const entry = queueData.reports.find((r: { commentId: string }) => r.commentId === commentId);
    expect(entry).toBeTruthy();
    expect(entry.reportCount).toBe(1);

    const { comments: reopenedComments } = await fetchAllComments(request, `/api/anime/${adminAnimeId}/comments`, {
      Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}`,
    });
    expect(reopenedComments.find((c: { id: string }) => c.id === commentId).reportedByMe).toBe(true);

    // Deixa resolvido de novo pra não vazar denúncia pendente pros
    // próximos testes deste arquivo.
    await request.post(`/api/admin/comment-reports/${commentId}/resolve`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
      data: { action: "keep" },
    });
  });

  test("autor apaga o próprio comentário", async ({ request }) => {
    const del = await request.delete(`/api/comments/${commentId}`);
    expect(del.status()).toBe(200);

    const { comments: afterDeleteComments } = await fetchAllComments(request, `/api/anime/${animeId}/comments`);
    expect(afterDeleteComments.some((c: { id: string }) => c.id === commentId)).toBe(false);
  });

  test("outro usuário não consegue apagar o comentário de alguém", async ({ request }) => {
    const create = await request.post(`/api/anime/${animeId}/comments`, {
      data: { body: "Comentário pra testar exclusão indevida" },
    });
    const created = await create.json();

    const del = await request.delete(`/api/comments/${created.comment.id}`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    expect(del.status()).toBe(404);
  });
});

test.describe("Comentários exigem login", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("GET /api/anime/:id/comments retorna 401 sem sessão", async ({ request }) => {
    const res = await request.get("/api/anime/anything/comments");
    expect(res.status()).toBe(401);
  });

  test("POST /api/anime/:id/comments retorna 401 sem sessão", async ({ request }) => {
    const res = await request.post("/api/anime/anything/comments", { data: { body: "oi" } });
    expect(res.status()).toBe(401);
  });

  test("DELETE /api/comments/:id retorna 401 sem sessão", async ({ request }) => {
    const res = await request.delete("/api/comments/anything");
    expect(res.status()).toBe(401);
  });

  test("POST /api/comments/:id/report retorna 401 sem sessão", async ({ request }) => {
    const res = await request.post("/api/comments/anything/report");
    expect(res.status()).toBe(401);
  });
});
