import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_ADMIN_EMAIL, TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const ANILIST_ID = 901700;

test.describe("Epic 18 — 17ª rodada de auditoria de UX/UI — badge de comentário sincroniza com a contagem real", () => {
  let animeId: string;
  let postId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: ANILIST_ID } },
      create: { userId: user.id, anilistId: ANILIST_ID, titleRomaji: "Anime Round17 Comment Count Test", genres: "" },
      update: {},
    });
    animeId = anime.id;
    const post = await prisma.post.create({
      data: {
        userId: user.id,
        anilistId: anime.anilistId,
        animeTitleRomaji: anime.titleRomaji,
        body: "Post pra testar sincronização do badge de comentário",
      },
    });
    postId = post.id;
    await prisma.postComment.create({
      data: { postId, userId: user.id, body: "Comentário semeado, visível desde o início" },
    });
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.post.deleteMany({ where: { id: postId } });
    await prisma.$disconnect();
  });

  // Achado real da 17ª rodada de auditoria (Epic 18): o badge de contagem
  // no PostCard só andava por deltas ±1 das próprias ações do viewer,
  // nunca se corrigindo contra a contagem real quando outra pessoa
  // comenta enquanto a thread está fechada — o número ficava
  // desatualizado pra sempre (e cada ação própria seguinte piorava o
  // desvio) até um reload inteiro da página.
  test("comentário de outra pessoa, feito com a thread fechada, atualiza o badge ao reabrir", async ({
    page,
  }) => {
    await page.goto("/");

    const card = page.getByTestId(`post-card-${postId}`);
    await expect(card).toBeVisible();
    const commentButton = card.getByRole("button", { name: /^Responder ·/ });
    await expect(commentButton).toContainText("Responder · 1");

    // Outra pessoa comenta enquanto a thread está fechada nesta aba.
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } });
    await prisma.postComment.create({
      data: { postId, userId: admin.id, body: "Comentário de outra pessoa, com a thread fechada" },
    });
    await prisma.$disconnect();

    // Badge continua mostrando o valor antigo até a thread ser reaberta —
    // não há polling nem WebSocket, então isso é esperado; o que a
    // correção garante é o valor certo assim que a thread é reaberta.
    await commentButton.click();
    await expect(card.getByText("Comentário de outra pessoa, com a thread fechada")).toBeVisible();
    await expect(commentButton).toContainText("Responder · 2");
  });
});
