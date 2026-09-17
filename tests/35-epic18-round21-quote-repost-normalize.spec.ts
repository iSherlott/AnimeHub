import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const ANILIST_ID = 906000;

test.describe("Epic 18 — 21ª rodada de auditoria de UX/UI — citar uma linha-repost resolve pro post original de verdade", () => {
  let animeId: string;
  let originalPostId: string;
  let originalAuthorId: string;
  let repostRowId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-admin@test.local" } });
    const testUser = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    originalAuthorId = admin.id;

    const animeForQuoter = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: testUser.id, anilistId: ANILIST_ID } },
      create: { userId: testUser.id, anilistId: ANILIST_ID, titleRomaji: "Anime Round21 Quote Repost Test", genres: "" },
      update: {},
    });
    animeId = animeForQuoter.id;

    const animeForOriginal = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: admin.id, anilistId: ANILIST_ID } },
      create: { userId: admin.id, anilistId: ANILIST_ID, titleRomaji: "Anime Round21 Quote Repost Test", genres: "" },
      update: {},
    });
    const original = await prisma.post.create({
      data: {
        userId: admin.id,
        anilistId: animeForOriginal.anilistId,
        animeTitleRomaji: animeForOriginal.titleRomaji,
        body: "Post original do admin, repostado e depois citado através da linha de repost",
      },
    });
    originalPostId = original.id;
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.post.deleteMany({ where: { OR: [{ id: originalPostId }, { repostOfId: originalPostId }] } });
    await prisma.$disconnect();
  });

  // Achado real da 21ª rodada de auditoria (Epic 18): uma linha-repost não
  // tem corpo/autor próprios de verdade (Epic 25 — só existe pra marcar
  // "Fulano repostou" na posição certa do feed) — mas nada normalizava
  // `quotedPostId` quando ele apontava pra uma dessas linhas em vez do
  // original, então a pré-visualização da citação vinha em branco,
  // atribuída a quem repostou em vez do autor de verdade. A UI normal
  // nunca expõe o `id` de uma linha-repost (o feed sempre resolve pro
  // original antes de montar o DTO), então simula o único jeito real de
  // alcançar esse estado: repostar de verdade pela rota, buscar o id
  // interno da linha resultante direto no banco, e citar esse id.
  test("citar a linha-repost normaliza pro post original de verdade, não pro reposter", async ({ request }) => {
    const repost = await request.patch(`/api/posts/${originalPostId}/repost`, { data: { reposted: true } });
    expect(repost.ok()).toBe(true);

    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const testUser = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const repostRow = await prisma.post.findFirstOrThrow({
      where: { userId: testUser.id, repostOfId: originalPostId },
    });
    repostRowId = repostRow.id;
    await prisma.$disconnect();

    const res = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "Citando a linha-repost em vez do original diretamente", quotedPostId: repostRowId },
    });
    expect(res.status()).toBe(201);
    const data = await res.json();
    expect(data.post.quotedPost).toMatchObject({
      id: originalPostId,
      body: "Post original do admin, repostado e depois citado através da linha de repost",
    });
    expect(data.post.quotedPost.author.id).toBe(originalAuthorId);

    // Também confirma no caminho de LEITURA (feed), não só na resposta da
    // criação — os 2 caminhos já divergiram nesta mesma classe de bug
    // antes (ver postFeedDto.ts).
    const feed = await request.get("/api/posts?tab=recommended&limit=100");
    const feedData = await feed.json();
    const created = feedData.posts.find((p: { id: string }) => p.id === data.post.id);
    expect(created.quotedPost).toMatchObject({ id: originalPostId });
    expect(created.quotedPost.author.id).toBe(originalAuthorId);
  });
});
