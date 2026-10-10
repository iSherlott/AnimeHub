import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const ANILIST_ID = 903000;

test.describe("Epic 18 — 18ª rodada de auditoria de UX/UI — citação de post apagado", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: ANILIST_ID } },
      create: { userId: user.id, anilistId: ANILIST_ID, titleRomaji: "Anime Round18 Quote Delete Test", genres: "" },
      update: {},
    });
    animeId = anime.id;
    await prisma.$disconnect();
  });

  // Achado real da 18ª rodada de auditoria (Epic 18): o corpo/autor de um
  // post apagado continuava circulando pra sempre dentro de toda citação
  // dele — a citação nunca checava `deletedAt` do post citado, ao
  // contrário do repost (que já filtrava esse caso desde o Epic 25).
  test("apagar o post original faz a citação parar de mostrar a pré-visualização", async ({
    request,
  }) => {
    const original = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "Post original que vai ser apagado" },
    });
    const originalPostId = (await original.json()).post.id;

    const quoting = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "Post citando o original", quotedPostId: originalPostId },
    });
    const quotingData = await quoting.json();
    expect(quotingData.post.quotedPost).toMatchObject({ id: originalPostId });

    const del = await request.delete(`/api/posts/${originalPostId}`);
    expect(del.ok()).toBe(true);

    const feed = await request.get("/api/posts?tab=recommended&limit=100");
    const feedData = await feed.json();
    const quotingInFeed = feedData.posts.find((p: { id: string }) => p.id === quotingData.post.id);
    expect(quotingInFeed).toBeTruthy();
    expect(quotingInFeed.quotedPost).toBeNull();
  });
});

test.describe("Epic 18 — 18ª rodada de auditoria de UX/UI — repost/comentário sincronizam entre as 2 entradas do mesmo post", () => {
  let originalPostId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-admin@test.local" } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: admin.id, anilistId: ANILIST_ID + 1 } },
      create: { userId: admin.id, anilistId: ANILIST_ID + 1, titleRomaji: "Anime Round18 Sync Test", genres: "" },
      update: {},
    });
    const post = await prisma.post.create({
      data: {
        userId: admin.id,
        anilistId: anime.anilistId,
        animeTitleRomaji: anime.titleRomaji,
        body: "Post do admin, vai ser repostado pelo usuário de teste padrão",
      },
    });
    originalPostId = post.id;
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.post.deleteMany({ where: { OR: [{ id: originalPostId }, { repostOfId: originalPostId }] } });
    await prisma.$disconnect();
  });

  // Achado real da 18ª rodada: o contador de comentário e o estado de
  // repost viviam só no estado LOCAL de cada instância de PostCard — como
  // o mesmo post aparece 2x na página (ele mesmo + "Fulano repostou"), uma
  // ação numa instância nunca refletia na outra sem recarregar a página
  // inteira.
  test("repostar via API e comentar numa instância atualiza o contador na outra, sem recarregar", async ({
    page,
    request,
  }) => {
    // O próprio usuário de teste padrão (sessão default do `page`) reposta
    // o post do admin — agora existem 2 cards pro MESMO post nesta página:
    // um "self" (autor: admin) e um "TEST_USER repostou".
    const repost = await request.patch(`/api/posts/${originalPostId}/repost`, {
      data: { reposted: true },
    });
    expect(repost.ok()).toBe(true);

    await page.goto("/");
    const allCardsForPost = page.locator(`[data-testid="post-card-${originalPostId}"]`);
    await expect(allCardsForPost).toHaveCount(2);

    const repostCard = allCardsForPost.filter({ hasText: "repostou" });
    const selfCard = allCardsForPost.filter({ hasNotText: "repostou" });
    await expect(repostCard).toBeVisible();
    await expect(selfCard).toBeVisible();

    // Comenta a partir da entrada de REPOST.
    await repostCard.getByRole("button", { name: /^Responder ·/ }).click();
    await repostCard.getByPlaceholder("Escreva uma resposta...").fill("Comentário via a entrada de repost");
    await repostCard.getByRole("button", { name: "Enviar resposta" }).click();
    await expect(repostCard.getByText("Comentário via a entrada de repost")).toBeVisible();

    // A entrada "self" (nunca aberta, nunca teve sua própria thread
    // buscada) precisa mostrar o mesmo contador atualizado sem reload —
    // curtida (LikeToggle) começa em 0 e não muda neste teste, então "1"
    // só pode ser o contador de comentário (mesma checagem já usada em
    // tests/30-epic18-round17-comment-count-sync.spec.ts).
    await expect(selfCard.getByRole("button", { name: "Responder · 1" })).toBeVisible();
  });

  test("desfazer o repost remove a entrada correspondente sem recarregar", async ({ page, request }) => {
    // Garante estado conhecido: repostado antes do teste começar.
    await request.patch(`/api/posts/${originalPostId}/repost`, { data: { reposted: true } });

    await page.goto("/");
    const allCardsForPost = page.locator(`[data-testid="post-card-${originalPostId}"]`);
    await expect(allCardsForPost).toHaveCount(2);
    const repostCard = allCardsForPost.filter({ hasText: "repostou" });

    await repostCard.getByRole("button", { name: "Compartilhar internamente" }).click();
    await page.getByRole("menuitem", { name: "Desfazer repost" }).click();

    // A entrada de repost some sozinha; só a "self" continua na tela.
    await expect(allCardsForPost).toHaveCount(1);
    await expect(page.getByText(/repostou/)).toHaveCount(0);
  });
});
