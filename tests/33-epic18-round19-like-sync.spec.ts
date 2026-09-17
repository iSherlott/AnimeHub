import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
// anilistId fora da faixa usada por outras fixtures.
const ANILIST_ID = 904000;

test.describe("Epic 18 — 19ª rodada de auditoria de UX/UI — curtida sincroniza entre as 2 entradas do mesmo post", () => {
  let originalPostId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-admin@test.local" } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: admin.id, anilistId: ANILIST_ID } },
      create: { userId: admin.id, anilistId: ANILIST_ID, titleRomaji: "Anime Round19 Like Sync Test", genres: "" },
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

  // Achado real da 19ª rodada de auditoria (Epic 18): LikeToggle.tsx tinha
  // ficado de fora da correção da 18ª rodada (que já lidou com o mesmo
  // bug pro contador de comentário e pro estado de repost) — curtir numa
  // das 2 instâncias do mesmo post (ele mesmo + "Fulano repostou") não
  // atualizava a outra sem recarregar, mesmo o servidor já refletindo a
  // curtida corretamente pras 2.
  test("curtir numa entrada (a de repost) atualiza a outra (a self), sem recarregar", async ({
    page,
    request,
  }) => {
    const repost = await request.patch(`/api/posts/${originalPostId}/repost`, {
      data: { reposted: true },
    });
    expect(repost.ok()).toBe(true);

    await page.goto("/");
    const allCardsForPost = page.locator(`[data-testid="post-card-${originalPostId}"]`);
    await expect(allCardsForPost).toHaveCount(2);

    const repostCard = allCardsForPost.filter({ hasText: "repostou" });
    const selfCard = allCardsForPost.filter({ hasNotText: "repostou" });

    await repostCard.getByRole("button", { name: "Curtir" }).click();
    await expect(repostCard.getByRole("button", { name: "Descurtir" })).toBeVisible();

    // A entrada "self" precisa refletir o mesmo like (coração preenchido
    // + contador 1), sem nenhum reload, mesmo nunca tendo sido clicada.
    await expect(selfCard.getByRole("button", { name: "Descurtir" })).toBeVisible();
    await expect(selfCard.getByText("1", { exact: true })).toBeVisible();
  });
});
