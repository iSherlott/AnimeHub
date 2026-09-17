import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const ANILIST_ID = 908000;

test.describe("Epic 18 — 22ª rodada de auditoria de UX/UI — modo citação: foco/anúncio ao ativar", () => {
  // Achado real da 22ª rodada: clicar em "Citar" só rolava a página até o
  // compositor (útil só pra quem usa mouse) — teclado/leitor de tela não
  // tinham nenhum sinal de que o modo citação tinha ligado. Corrigido com
  // `role="status"` na faixa + foco movido pro campo de texto.
  test("clicar em 'Citar' anuncia o modo citação e move o foco pro campo de texto do compositor", async ({
    page,
    request,
  }) => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: ANILIST_ID } },
      create: { userId: user.id, anilistId: ANILIST_ID, titleRomaji: "Anime Round22 Quote Focus Test", genres: "" },
      update: {},
    });
    await prisma.$disconnect();

    const create = await request.post(`/api/anime/${anime.id}/posts`, {
      data: { body: "Post pra ser citado nesta rodada de teste" },
    });
    const postId = (await create.json()).post.id;

    await page.goto("/");
    const card = page.getByTestId(`post-card-${postId}`);
    await expect(card).toBeVisible();

    await card.getByRole("button", { name: "Citar" }).click();

    const banner = page.getByRole("status").filter({ hasText: "Citando post de" });
    await expect(banner).toBeVisible();
    await expect(page.getByPlaceholder("O que você achou desse anime?")).toBeFocused();

    await request.delete(`/api/posts/${postId}`);
  });
});

test.describe("Epic 18 — 22ª rodada de auditoria de UX/UI — embed de citação linka pro autor citado", () => {
  let animeId: string;
  let quotedPostId: string;
  let quotedAuthorId: string;
  let quotedAuthorName: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const testUser = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-admin@test.local" } });
    quotedAuthorId = admin.id;
    quotedAuthorName = admin.displayName;

    const animeForQuoter = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: testUser.id, anilistId: ANILIST_ID + 1 } },
      create: { userId: testUser.id, anilistId: ANILIST_ID + 1, titleRomaji: "Anime Round22 Quote Link Test", genres: "" },
      update: {},
    });
    animeId = animeForQuoter.id;

    const animeForOriginal = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: admin.id, anilistId: ANILIST_ID + 1 } },
      create: { userId: admin.id, anilistId: ANILIST_ID + 1, titleRomaji: "Anime Round22 Quote Link Test", genres: "" },
      update: {},
    });
    const quoted = await prisma.post.create({
      data: {
        userId: admin.id,
        anilistId: animeForOriginal.anilistId,
        animeTitleRomaji: animeForOriginal.titleRomaji,
        body: "Post original do admin, citado nesta rodada de teste",
      },
    });
    quotedPostId = quoted.id;
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.post.deleteMany({ where: { OR: [{ id: quotedPostId }, { quotedPostId }] } });
    await prisma.$disconnect();
  });

  // Achado real da 22ª rodada: ao contrário do autor do post de fora (já
  // linkava pro perfil), o autor do post CITADO era texto puro, sem link
  // nem clique nenhum — mesmo o app tendo página de perfil pra ele.
  test("nome do autor citado é um link pro perfil dele, não texto inerte", async ({ page, request }) => {
    const create = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "Citando o post do admin", quotedPostId },
    });
    const citingPostId = (await create.json()).post.id;

    await page.goto("/");
    const card = page.getByTestId(`post-card-${citingPostId}`);
    await expect(card).toBeVisible();

    const authorLink = card.getByRole("link", { name: quotedAuthorName });
    await expect(authorLink).toBeVisible();
    await expect(authorLink).toHaveAttribute("href", `/users/${quotedAuthorId}`);

    await authorLink.click();
    await expect(page).toHaveURL(`/users/${quotedAuthorId}`);
  });
});

test.describe("Epic 18 — 22ª rodada de auditoria de UX/UI — 'mais comentadas hoje' usa a meia-noite do NAVEGADOR, não a do servidor", () => {
  const trendingAnilistId = ANILIST_ID + 2;
  test.use({ storageState: { cookies: [], origins: [] } });

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: trendingAnilistId } },
      create: { userId: user.id, anilistId: trendingAnilistId, titleRomaji: "Anime Round22 Trending TZ Test", genres: "" },
      update: {},
    });
    // Comentário de "ontem" (2h depois da meia-noite de ontem, no relógio
    // do próprio servidor) — não conta como "hoje" pelo relógio dele, mas
    // conta como "hoje" pra quem manda um `todayStart` de ontem (um
    // viewer atrasado em relação ao fuso do servidor).
    const serverMidnightToday = new Date();
    serverMidnightToday.setHours(0, 0, 0, 0);
    const yesterdayMidnight = new Date(serverMidnightToday.getTime() - 24 * 3600 * 1000);
    const commentCreatedAt = new Date(yesterdayMidnight.getTime() + 2 * 3600 * 1000);
    await prisma.comment.create({
      data: {
        anilistId: trendingAnilistId,
        userId: user.id,
        body: "Comentário de ontem no relógio do servidor",
        createdAt: commentCreatedAt,
      },
    });
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.comment.deleteMany({ where: { anilistId: trendingAnilistId } });
    await prisma.$disconnect();
  });

  // Achado real da 22ª rodada: a rota calculava "hoje" só com o relógio do
  // servidor (UTC no Docker Compose, sem `TZ` em nenhum serviço) — igual
  // ao bug que o calendário (Epic 18, achado documentado em
  // src/app/calendar/page.tsx) já tinha resolvido enviando a meia-noite do
  // NAVEGADOR como parâmetro em vez de deixar o servidor recalcular.
  test("sem todayStart, usa a meia-noite do servidor (comentário de ontem não conta)", async ({ request }) => {
    const res = await request.get("/api/anime-threads/trending");
    expect(res.status()).toBe(200);
    const data = await res.json();
    const inToday = data.mostCommentedToday.find(
      (t: { anilistId: number }) => t.anilistId === trendingAnilistId
    );
    expect(inToday).toBeFalsy();
  });

  test("com todayStart de ontem, o comentário de ontem passa a contar como 'hoje'", async ({ request }) => {
    const serverMidnightToday = new Date();
    serverMidnightToday.setHours(0, 0, 0, 0);
    const yesterdayMidnightUnix = Math.floor((serverMidnightToday.getTime() - 24 * 3600 * 1000) / 1000);

    const res = await request.get(`/api/anime-threads/trending?todayStart=${yesterdayMidnightUnix}`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    const inToday = data.mostCommentedToday.find(
      (t: { anilistId: number }) => t.anilistId === trendingAnilistId
    );
    expect(inToday).toMatchObject({ anilistId: trendingAnilistId, commentCount: 1 });
  });
});
