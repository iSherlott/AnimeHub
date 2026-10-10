import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const ANILIST_ID = 901600;

// Sessão fixa dedicada, só usada pelo teste de logout deste arquivo — nunca
// a TEST_SESSION_TOKEN compartilhada: "Sair" chama destroySession(), que
// apaga a LINHA de sessão no banco pelo token, não só o cookie desta aba.
// Reusar a sessão padrão aqui mataria o resto da suíte inteira (mesma
// armadilha documentada em tests/18-epic18-round5.spec.ts, cujo próprio
// teste de "sessão invalidada em uso" já usa esse mesmo padrão de sessão
// descartável por este exato motivo).
const LOGOUT_SESSION_TOKEN =
  "10go0000000000000000000000000000000000000000000000000000000001";
const LOGOUT_USER_EMAIL = "e2e-round16-logout@test.local";

test.describe("Epic 18 — 16ª rodada de auditoria de UX/UI — paginação não duplica post publicado no meio da rolagem", () => {
  let postIds: string[];

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });

    await prisma.post.deleteMany({ where: { userId: user.id, anilistId: ANILIST_ID } });
    const now = Date.now();
    const created = await Promise.all(
      [0, 1, 2].map((i) =>
        prisma.post.create({
          data: {
            userId: user.id,
            anilistId: ANILIST_ID,
            animeTitleRomaji: "Anime Round16 Pagination Race Test",
            body: `Post de corrida de paginação #${i}`,
            createdAt: new Date(now - i * 20 * 60 * 1000),
          },
        })
      )
    );
    postIds = created.map((p) => p.id).sort();

    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.post.deleteMany({ where: { id: { in: postIds } } });
    await prisma.$disconnect();
  });

  // Achado real da 16ª rodada de auditoria (Epic 18): a janela ranqueada
  // era reconsultada do zero a cada página, sem travar o CONJUNTO de posts
  // elegíveis pro mesmo instante fixado por `since` — só a pontuação
  // (gravidade) era recalculada com esse instante fixo (correção da 15ª
  // rodada). Um post novo publicado por qualquer pessoa no meio de uma
  // sessão de rolagem empurrava o índice de todo post mais antigo adiante,
  // fazendo a página seguinte (ainda pedindo o mesmo `offset` de antes)
  // repetir um post que a página anterior já tinha mostrado.
  test("publicar um post novo entre 2 páginas não faz nenhuma página repetir um post já visto", async ({
    request,
  }) => {
    // Limite pequeno de propósito (não os 300 da janela inteira) — força
    // várias páginas de verdade, mesmo padrão de
    // 26-epic18-round15-feed-pagination.spec.ts. Não assume que os 3 posts
    // desta fixture caem nas primeiras páginas (a suíte inteira pode ter
    // dezenas de outros posts mais bem ranqueados) — em vez disso, percorre
    // a janela inteira e confirma a invariante geral (nenhum id visto 2x) e
    // que os 3 posts da fixture aparecem em algum ponto, exatamente 1 vez.
    const first = await request.get("/api/posts?tab=recommended&limit=2");
    expect(first.ok()).toBe(true);
    const dataFirst = await first.json();
    const since = dataFirst.since;

    // Alguém publica um post novo já com a 1ª página em mãos, ainda dentro
    // da mesma sessão de rolagem (mesmo `since`) — grava direto via Prisma
    // pra controlar o conteúdo sem depender de outro anime existir.
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const midScrollPost = await prisma.post.create({
      data: {
        userId: user.id,
        anilistId: ANILIST_ID,
        animeTitleRomaji: "Anime Round16 Pagination Race Test",
        body: "Post publicado NO MEIO da sessão de rolagem",
      },
    });

    const seenIds: string[] = dataFirst.posts.map((p: { id: string }) => p.id);
    let offset = typeof dataFirst.nextOffset === "number" ? dataFirst.nextOffset : null;
    for (let guard = 0; guard < 200 && offset !== null; guard++) {
      const res = await request.get(
        `/api/posts?tab=recommended&limit=2&offset=${offset}&since=${encodeURIComponent(since)}`
      );
      const data = await res.json();
      for (const p of data.posts as { id: string }[]) {
        expect(seenIds).not.toContain(p.id); // nunca repete
        seenIds.push(p.id);
      }
      offset = typeof data.nextOffset === "number" ? data.nextOffset : null;
    }

    // O post publicado no meio da rolagem não entra nesta sessão (é mais
    // novo que `since`) — só apareceria numa sessão de rolagem nova.
    expect(seenIds).not.toContain(midScrollPost.id);
    // Os 3 posts da fixture, criados antes de `since`, sobrevivem à
    // rolagem inteira — cada um aparece em algum ponto (já garantido não
    // repetir por causa do `expect` dentro do laço acima).
    for (const id of postIds) {
      expect(seenIds).toContain(id);
    }

    await prisma.post.delete({ where: { id: midScrollPost.id } });
    await prisma.$disconnect();
  });

  // Achado real da revisão de código independente sobre a correção acima:
  // o espelho exato do mesmo bug, só que por REMOÇÃO em vez de inserção.
  // `deletedAt: null` sozinho é reavaliado do zero a cada página — apagar
  // um post no meio da mesma sessão de rolagem encolhe a janela por trás
  // do offset já usado, e a página seguinte pula um post que nunca chegou
  // a aparecer em nenhuma página.
  test("apagar um post entre 2 páginas não faz nenhuma página pular um post ainda não visto", async ({
    request,
  }) => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const toBeDeleted = await prisma.post.create({
      data: {
        userId: user.id,
        anilistId: ANILIST_ID,
        animeTitleRomaji: "Anime Round16 Pagination Race Test",
        body: "Post que vai ser apagado NO MEIO da sessão de rolagem",
      },
    });

    const first = await request.get("/api/posts?tab=recommended&limit=2");
    const dataFirst = await first.json();
    const since = dataFirst.since;

    await prisma.post.update({ where: { id: toBeDeleted.id }, data: { deletedAt: new Date() } });

    const seenIds: string[] = dataFirst.posts.map((p: { id: string }) => p.id);
    let offset = typeof dataFirst.nextOffset === "number" ? dataFirst.nextOffset : null;
    for (let guard = 0; guard < 200 && offset !== null; guard++) {
      const res = await request.get(
        `/api/posts?tab=recommended&limit=2&offset=${offset}&since=${encodeURIComponent(since)}`
      );
      const data = await res.json();
      for (const p of data.posts as { id: string }[]) {
        expect(seenIds).not.toContain(p.id);
        seenIds.push(p.id);
      }
      offset = typeof data.nextOffset === "number" ? data.nextOffset : null;
    }

    // Apagado DEPOIS de `since` — continua elegível pra ESTA sessão de
    // rolagem, mesmo já não existindo mais de verdade por fora dela.
    for (const id of postIds) {
      expect(seenIds).toContain(id);
    }
    expect(seenIds).toContain(toBeDeleted.id);

    await prisma.post.deleteMany({ where: { id: toBeDeleted.id } });
    await prisma.$disconnect();
  });
});

test.describe("Epic 18 — 16ª rodada de auditoria de UX/UI — deslogar invalida o feed já carregado", () => {
  test.use({
    storageState: {
      cookies: [
        {
          name: SESSION_COOKIE_NAME,
          value: LOGOUT_SESSION_TOKEN,
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

  let postId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.upsert({
      where: { email: LOGOUT_USER_EMAIL },
      create: {
        email: LOGOUT_USER_EMAIL,
        passwordHash: "e2e-fixture-not-a-real-hash",
        passwordSalt: "e2e-fixture-not-a-real-salt",
        displayName: "E2E Round16 Logout",
      },
      update: {},
    });
    await prisma.session.upsert({
      where: { token: LOGOUT_SESSION_TOKEN },
      create: {
        token: LOGOUT_SESSION_TOKEN,
        userId: user.id,
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
      update: { expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000) },
    });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: ANILIST_ID + 1 } },
      create: { userId: user.id, anilistId: ANILIST_ID + 1, titleRomaji: "Anime Round16 Logout Test", genres: "" },
      update: {},
    });
    await prisma.post.deleteMany({ where: { userId: user.id, anilistId: anime.anilistId } });
    const post = await prisma.post.create({
      data: {
        userId: user.id,
        anilistId: anime.anilistId,
        animeTitleRomaji: anime.titleRomaji,
        body: "Post que deve parar de mostrar 'Apagar' depois de deslogar",
      },
    });
    postId = post.id;
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.post.deleteMany({ where: { id: postId } });
    await prisma.$disconnect();
  });

  // Achado real da 16ª rodada: `Header.handleLogout` chama `router.refresh()`,
  // que só revalida a árvore de Server Components — o fetch do próprio
  // FeedView (Client Component, useEffect) não é refeito sozinho. O post
  // continuava mostrando o ícone de "Apagar post" (isMine) mesmo depois de
  // deslogar, até a pessoa recarregar a página manualmente.
  test("apagar/curtir somem do post depois de clicar em Sair, sem precisar recarregar", async ({
    page,
  }) => {
    await page.goto("/");

    const card = page.getByTestId(`post-card-${postId}`);
    await expect(card).toBeVisible();
    await expect(card.getByRole("button", { name: "Excluir" })).toBeVisible();

    // "Sair" vive atrás do menu de conta (avatar) desde o lote 3 do
    // Epic 27 — não é mais um botão solto no cabeçalho.
    await page.getByRole("button", { name: "Menu da conta" }).click();
    await page.getByRole("menuitem", { name: "Sair" }).click();

    await expect(page.getByRole("link", { name: "Entrar" }).first()).toBeVisible();
    // O mesmo card (mesmo post) não deve mais se oferecer como apagável —
    // sem isso, um clique nele hoje já falha no servidor (401), mas o
    // controle continua na tela como se ainda fosse "meu" post.
    await expect(card.getByRole("button", { name: "Excluir" })).toBeHidden();
  });
});
