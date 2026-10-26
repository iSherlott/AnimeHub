import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Terceira sessão fixa, só usada neste arquivo — perfil "alvo" com contagens
// controladas (0 posts/0 seguidores no início) pra testar singular/plural e
// a atualização otimista do contador de seguidores.
const THIRD_SESSION_TOKEN =
  "ac1d0000000000000000000000000000000000000000000000000000000001";
const THIRD_USER_EMAIL = "e2e-round3-third@test.local";

test.describe("Epic 18 — 3ª rodada de auditoria de UX/UI", () => {
  let animeId: string;
  let thirdUserId: string;
  let thirdAnimeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.findFirstOrThrow({ where: { userId: user.id } });
    animeId = anime.id;

    const third = await prisma.user.upsert({
      where: { email: THIRD_USER_EMAIL },
      create: {
        email: THIRD_USER_EMAIL,
        passwordHash: "e2e-fixture-not-a-real-hash",
        passwordSalt: "e2e-fixture-not-a-real-salt",
        displayName: "E2E Round3 Third User",
      },
      update: {},
    });
    thirdUserId = third.id;
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
      where: { userId_anilistId: { userId: third.id, anilistId: anime.anilistId as number } },
      create: { userId: third.id, anilistId: anime.anilistId, titleRomaji: anime.titleRomaji },
      update: {},
    });
    thirdAnimeId = thirdAnime.id;

    // Estado limpo, independente de rodadas anteriores da suíte: sem posts
    // nem seguidores prévios pro terceiro usuário.
    await prisma.post.deleteMany({ where: { userId: third.id } });
    await prisma.follow.deleteMany({ where: { followingId: third.id } });

    await prisma.$disconnect();
  });

  test("menu hambúrguer cobre a faixa intermediária de largura (achado real: nav quebrava sem hambúrguer nem couber inteiro)", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto("/");

    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();
    // O link "Descobrir" da navegação desktop (fora do drawer) não deve
    // estar visível nessa largura — só o hambúrguer.
    const desktopDiscoverLink = page.locator('a[href="/discover"]').first();
    await expect(desktopDiscoverLink).toBeHidden();
  });

  test("nome do autor no card do feed linka pro perfil público", async ({ page, request }) => {
    const create = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "Post pra testar o link do autor" },
    });
    expect(create.status()).toBe(201);
    const post = (await create.json()).post;

    await page.goto("/");
    const card = page.getByTestId(`post-card-${post.id}`);
    await expect(card).toBeVisible();
    const authorLink = card.getByRole("link", { name: post.author.displayName });
    await expect(authorLink).toBeVisible();
    await expect(authorLink).toHaveAttribute("href", `/users/${post.author.id}`);
  });

  test("contador de seguidores atualiza sem precisar recarregar a página", async ({ page }) => {
    await page.goto(`/users/${thirdUserId}`);
    const stats = page.getByText(/seguidor/);
    await expect(stats).toContainText("0 seguidores");

    await page.getByRole("button", { name: "Seguir" }).click();
    await expect(page.getByRole("button", { name: "Seguindo" })).toBeVisible();
    // Ainda na mesma página (sem reload) e já com a contagem nova.
    await expect(stats).toContainText("1 seguidor ");
    await expect(page).toHaveURL(`/users/${thirdUserId}`);
  });

  test("singular correto em '1 post' e '1 seguidor' (não '1 posts'/'1 seguidores')", async ({
    request,
    page,
  }) => {
    // O seguidor já veio do teste anterior (mesmo arquivo, mesma ordem) —
    // só falta o único post pra fechar "1 seguidor · 0 seguindo · 1 publicação".
    await request.post(`/api/anime/${thirdAnimeId}/posts`, {
      headers: { Cookie: `${SESSION_COOKIE_NAME}=${THIRD_SESSION_TOKEN}` },
      data: { body: "Único post deste usuário" },
    });

    await page.goto(`/users/${thirdUserId}`);
    const stats = page.getByText(/seguidor/);
    await expect(stats).toHaveText("1 seguidor · 0 seguindo · 1 publicação");
  });
});

test.describe("Epic 18 — 3ª rodada — admin", () => {
  test.use({
    storageState: {
      cookies: [
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
      ],
      origins: [],
    },
  });

  test("resetar senha abre num diálogo, sem sobrepor a tabela", async ({ page }) => {
    await page.goto("/admin/acesso");

    // Nunca o TEST_USER_EMAIL compartilhado aqui — resetar senha derruba
    // TODAS as sessões ativas dessa pessoa de propósito (segurança real,
    // não bug), o que mataria a TEST_SESSION_TOKEN que o resto da suíte
    // inteira usa como sessão padrão. Usa o terceiro usuário descartável
    // já criado no beforeAll deste arquivo, cuja sessão nada mais depende
    // de continuar viva depois deste teste (achado real, causa raiz de
    // falhas aparentemente aleatórias em arquivos de teste posteriores).
    const row = page.getByRole("row", { name: new RegExp(THIRD_USER_EMAIL) });
    await row.getByRole("button", { name: "Resetar senha" }).click();

    const dialog = page.getByRole("dialog", { name: "Nova senha temporária" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Fechar" }).click();
    await expect(dialog).toBeHidden();
  });
});

// Sessão fixa dedicada, com nome de exibição propositalmente longo (estoura
// o maxWidth:100 truncado no cabeçalho) — pior caso real que a 1ª versão
// deste teste não cobria (achado da revisão de código: "lg" a 1200px media
// exatamente 0px de folga nesse cenário, não "com folga" como o comentário
// dizia). Testa bem em cima do breakpoint customizado (1240px) e confirma
// que o caso comum de 1280px (largura padrão do Playwright) continua
// mostrando o nav completo — não pode regredir de novo pra "só empurrar o
// breakpoint pra cima".
const LONG_NAME_ADMIN_SESSION_TOKEN =
  "10ng0000000000000000000000000000000000000000000000000000000001";
const LONG_NAME_ADMIN_EMAIL = "e2e-round3-long-name-admin@test.local";

test.describe("Epic 18 — 3ª rodada — nav no pior caso real (admin, nome longo truncado)", () => {
  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const admin = await prisma.user.upsert({
      where: { email: LONG_NAME_ADMIN_EMAIL },
      create: {
        email: LONG_NAME_ADMIN_EMAIL,
        passwordHash: "e2e-fixture-not-a-real-hash",
        passwordSalt: "e2e-fixture-not-a-real-salt",
        displayName: "Administradora Com Nome Extremamente Longo De Verdade",
        role: "ADMIN",
      },
      update: { displayName: "Administradora Com Nome Extremamente Longo De Verdade", role: "ADMIN" },
    });
    await prisma.session.upsert({
      where: { token: LONG_NAME_ADMIN_SESSION_TOKEN },
      create: {
        token: LONG_NAME_ADMIN_SESSION_TOKEN,
        userId: admin.id,
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
      update: {},
    });
    await prisma.$disconnect();
  });

  test("hambúrguer cobre até o breakpoint, nav completo cabe sem overflow horizontal a partir dele — numa página com scrollbar vertical (/discover)", async ({
    page,
  }) => {
    await page.context().addCookies([
      { name: SESSION_COOKIE_NAME, value: LONG_NAME_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/" },
    ]);

    // "Sair" vive atrás do menu de conta (avatar) desde o lote 3 do Epic
    // 27 — o próprio botão que abre esse menu ("Menu da conta") é quem
    // aparece/some no breakpoint agora, não mais um botão "Sair" solto.
    // A área /admin tem a própria casca (barra lateral), então o cabeçalho do site é medido em /discover.
    await page.setViewportSize({ width: 1230, height: 900 });
    await page.goto("/discover");
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Menu da conta" })).toBeHidden();

    await page.setViewportSize({ width: 1260, height: 900 });
    await page.reload();
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Menu da conta" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("nav completo continua mostrando em 1280px (largura padrão da suíte) — regressão real da 1ª tentativa desta correção", async ({
    page,
  }) => {
    await page.context().addCookies([
      { name: SESSION_COOKIE_NAME, value: LONG_NAME_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/" },
    ]);
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/discover");
    await expect(page.getByRole("button", { name: "Abrir menu" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Menu da conta" })).toBeVisible();
  });
});
