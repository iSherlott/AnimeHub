import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";

// anilistId fora da faixa usada por outras fixtures.
const ANILIST_ID = 905000;

test.describe("Epic 18 — 20ª rodada de auditoria de UX/UI — denúncia e lista de comentários sincronizam entre as 2 entradas do mesmo post", () => {
  let originalPostId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-admin@test.local" } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: admin.id, anilistId: ANILIST_ID } },
      create: { userId: admin.id, anilistId: ANILIST_ID, titleRomaji: "Anime Round20 Sync Test", genres: "" },
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
    await prisma.postComment.create({
      data: { postId: originalPostId, userId: admin.id, body: "Comentário original, já existia antes do teste" },
    });
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.post.deleteMany({ where: { OR: [{ id: originalPostId }, { repostOfId: originalPostId }] } });
    await prisma.$disconnect();
  });

  // Achado real da 20ª rodada: `reportedByMe` era o último campo "por
  // post" que ainda vivia em estado local do PostCard — denunciar a
  // partir da instância de repost não refletia "Denunciado" na instância
  // "self" do mesmo post, mesmo o servidor já sabendo dos 2.
  test("denunciar numa entrada (a de repost) atualiza a outra (a self), sem recarregar", async ({
    page,
    request,
  }) => {
    const repost = await request.patch(`/api/posts/${originalPostId}/repost`, { data: { reposted: true } });
    expect(repost.ok()).toBe(true);

    await page.goto("/");
    const allCardsForPost = page.locator(`[data-testid="post-card-${originalPostId}"]`);
    await expect(allCardsForPost).toHaveCount(2);

    const repostCard = allCardsForPost.filter({ hasText: "repostou" });
    const selfCard = allCardsForPost.filter({ hasNotText: "repostou" });

    await repostCard.getByRole("button", { name: "Denunciar post" }).click();
    // Denúncia agora passa pelo diálogo de motivo + confirmação (Figma 13:43571).
    const reportDialog = page.getByRole("dialog");
    await reportDialog.getByLabel("Outro motivo").check();
    await reportDialog.getByTestId("report-continue").click();
    await reportDialog.getByTestId("report-send").click();
    await expect(repostCard.getByRole("button", { name: "Denunciado" })).toBeVisible();

    // A entrada "self" precisa refletir a mesma denúncia (botão
    // desabilitado + rótulo "Denunciado"), sem nenhum reload, mesmo
    // nunca tendo sido clicada.
    await expect(selfCard.getByRole("button", { name: "Denunciado" })).toBeVisible();
    await expect(selfCard.getByRole("button", { name: "Denunciado" })).toBeDisabled();
  });

  // Achado real da 20ª rodada, achado novo (não é o mesmo bug do Finding
  // 1): a correção da 17ª/18ª rodada já sincronizava a CONTAGEM (badge)
  // de comentário entre as 2 entradas — mas a LISTA de comentários em si
  // (o conteúdo da thread aberta) continuava vivendo só no estado local
  // de cada instância de PostComments, sem nenhum jeito de aprender
  // sobre uma mudança feita a partir da OUTRA instância da mesma thread.
  // Com a thread aberta nas 2 entradas ao mesmo tempo, comentar numa
  // deixava a outra com o badge certo (2) mas a lista desatualizada (só
  // 1 item) — badge e lista se contradizendo na mesma tela.
  test("comentar numa entrada com a thread aberta atualiza a lista da outra, também com a thread aberta", async ({
    page,
    request,
  }) => {
    const repost = await request.patch(`/api/posts/${originalPostId}/repost`, { data: { reposted: true } });
    expect(repost.ok()).toBe(true);

    await page.goto("/");
    const allCardsForPost = page.locator(`[data-testid="post-card-${originalPostId}"]`);
    await expect(allCardsForPost).toHaveCount(2);

    const repostCard = allCardsForPost.filter({ hasText: "repostou" });
    const selfCard = allCardsForPost.filter({ hasNotText: "repostou" });

    // Abre a thread nas 2 entradas ao mesmo tempo.
    await repostCard.getByRole("button", { name: "Comentários" }).click();
    await selfCard.getByRole("button", { name: "Comentários" }).click();
    await expect(repostCard.getByText("Comentário original, já existia antes do teste")).toBeVisible();
    await expect(selfCard.getByText("Comentário original, já existia antes do teste")).toBeVisible();

    // Comenta a partir da entrada de REPOST.
    await repostCard.getByPlaceholder("Escreva um comentário...").fill("Comentário novo via a entrada de repost");
    await repostCard.getByRole("button", { name: "Comentar" }).click();
    await expect(repostCard.getByText("Comentário novo via a entrada de repost")).toBeVisible();

    // A entrada "self", com a thread JÁ ABERTA desde antes, precisa
    // mostrar o comentário novo na LISTA (não só no badge), sem reload.
    await expect(selfCard.getByText("Comentário novo via a entrada de repost")).toBeVisible();
  });
});
