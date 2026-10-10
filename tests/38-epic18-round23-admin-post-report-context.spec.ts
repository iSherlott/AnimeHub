import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const ANILIST_ID = 909000;

test.describe("Epic 18 — 23ª rodada de auditoria de UX/UI — fila de denúncia de post mostra reposts/citações antes de remover", () => {
  let quoterAnimeId: string; // anime do TEST_USER (quem reposta/cita/denuncia) — pra citar via a rota, precisa ser dono do anime
  let originalPostId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-admin@test.local" } });
    const testUser = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });

    const adminAnime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: admin.id, anilistId: ANILIST_ID } },
      create: { userId: admin.id, anilistId: ANILIST_ID, titleRomaji: "Anime Round23 Admin Context Test", genres: "" },
      update: {},
    });
    const quoterAnime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: testUser.id, anilistId: ANILIST_ID } },
      create: { userId: testUser.id, anilistId: ANILIST_ID, titleRomaji: "Anime Round23 Admin Context Test", genres: "" },
      update: {},
    });
    quoterAnimeId = quoterAnime.id;
    const post = await prisma.post.create({
      data: {
        userId: admin.id,
        anilistId: adminAnime.anilistId,
        animeTitleRomaji: adminAnime.titleRomaji,
        body: "Post do admin, vai ser repostado/citado e depois denunciado",
      },
    });
    originalPostId = post.id;
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.postReport.deleteMany({ where: { postId: originalPostId } });
    await prisma.post.deleteMany({ where: { OR: [{ id: originalPostId }, { repostOfId: originalPostId }, { quotedPostId: originalPostId }] } });
    await prisma.$disconnect();
  });

  // Achado real da 23ª rodada: a fila de denúncia de post não dava
  // nenhuma pista de que remover (soft-delete) o post reportado ia
  // derrubar silenciosamente o embed de citação/a faixa "Fulano repostou"
  // pra quem vê esse post embutido em outro lugar do feed.
  test("GET /api/admin/post-reports inclui repostCount/quoteCount do post denunciado", async ({ request }) => {
    // O usuário de teste padrão (sessão default do `request`) reposta,
    // cita e denuncia o post do admin.
    const repost = await request.patch(`/api/posts/${originalPostId}/repost`, { data: { reposted: true } });
    expect(repost.ok()).toBe(true);

    const quote = await request.post(`/api/anime/${quoterAnimeId}/posts`, {
      data: { body: "Citando o post que vou denunciar", quotedPostId: originalPostId },
    });
    expect(quote.ok()).toBe(true);

    const report = await request.post(`/api/posts/${originalPostId}/report`);
    expect(report.status()).toBe(201);

    const queue = await request.get("/api/admin/post-reports", {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    expect(queue.status()).toBe(200);
    const queueData = await queue.json();
    const entry = queueData.reports.find((r: { postId: string }) => r.postId === originalPostId);
    expect(entry).toMatchObject({ repostCount: 1, quoteCount: 1 });

    // Deixa resolvido pra não vazar denúncia pendente pros próximos testes.
    await request.post(`/api/admin/post-reports/${originalPostId}/resolve`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
      data: { action: "keep" },
    });
  });

  test("o admin vê o aviso de repost/citação ao vivo, e a coluna Anime fica fixa ao rolar", async ({ page, request }) => {
    await request.patch(`/api/posts/${originalPostId}/repost`, { data: { reposted: true } });
    await request.post(`/api/posts/${originalPostId}/report`);

    await page.context().addCookies([
      {
        name: SESSION_COOKIE_NAME,
        value: TEST_ADMIN_SESSION_TOKEN,
        domain: "localhost",
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
        httpOnly: true,
        secure: false,
        sameSite: "Lax",
      },
    ]);
    await page.goto("/admin/acesso");

    const row = page.getByRole("row", { name: /Post do admin, vai ser repostado/ });
    await expect(row).toBeVisible();
    await expect(row.getByText(/Remover afeta outros posts/)).toBeVisible();
    await expect(row.getByText(/1 repost/)).toBeVisible();

    // Coluna "Anime" (1ª) precisa continuar visível/fixa mesmo rolando a
    // tabela pro lado (mobile) — mesma correção já usada na tabela de
    // Usuários desde a 7ª rodada, nunca aplicada aqui antes desta rodada.
    const animeCell = row.getByRole("cell").first();
    await expect(animeCell).toHaveCSS("position", "sticky");

    await request.post(`/api/admin/post-reports/${originalPostId}/resolve`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
      data: { action: "keep" },
    });
  });
});
