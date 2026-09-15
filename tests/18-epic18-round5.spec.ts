import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

test.describe("Epic 18 — 5ª rodada de auditoria de UX/UI — duplo clique não duplica", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.findFirstOrThrow({ where: { userId: user.id } });
    animeId = anime.id;
    await prisma.$disconnect();
  });

  test("clicar 'Publicar' duas vezes rápido no Feed cria só 1 post", async ({ page, request }) => {
    const uniqueBody = `Post de teste de duplo clique ${Date.now()}`;
    await page.goto("/");

    await page.locator('div[role="combobox"]').first().click();
    await page.getByRole("option").first().click();
    await page.getByPlaceholder("O que você achou desse anime?").fill(uniqueBody);

    // Dois cliques DOM síncronos no mesmo tick, via evaluate — um
    // `.click()` normal do Playwright espera o botão ficar habilitado de
    // novo antes do 2º clique (nunca reproduz a corrida de verdade), e
    // depois do 1º post ter sucesso o campo de texto esvazia sozinho e o
    // botão fica desabilitado por um motivo legítimo, travando a espera
    // pra sempre. `evaluate` despacha os dois cliques de verdade antes do
    // React sequer re-renderizar o `disabled`.
    const submit = page.getByRole("button", { name: "Publicar" });
    await submit.evaluate((el: HTMLElement) => {
      el.click();
      el.click();
    });
    await page.waitForTimeout(800);

    const res = await request.get("/api/posts?tab=recommended&limit=50");
    const data = await res.json();
    const matches = data.posts.filter((p: { body: string }) => p.body === uniqueBody);
    expect(matches.length).toBe(1);
  });

  test("clicar 'Comentar' duas vezes rápido cria só 1 comentário", async ({ page, request }) => {
    const uniqueBody = `Comentário de teste de duplo clique ${Date.now()}`;
    await page.goto(`/anime/${animeId}`);

    await page.getByPlaceholder("Escreva um comentário...").fill(uniqueBody);
    const submit = page.getByRole("button", { name: "Comentar" });
    await submit.evaluate((el: HTMLElement) => {
      el.click();
      el.click();
    });
    await page.waitForTimeout(800);

    const res = await request.get(`/api/anime/${animeId}/comments`);
    const data = await res.json();
    const matches = data.comments.filter((c: { body: string }) => c.body === uniqueBody);
    expect(matches.length).toBe(1);
  });

  test("clicar '+ Gerar convite' duas vezes rápido gera só 1 convite novo", async ({ page, request }) => {
    const adminHeaders = { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` };
    const before = await (
      await request.get("/api/admin/invites", { headers: adminHeaders })
    ).json();
    const countBefore = before.invites.length;

    await page.context().addCookies([
      { name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/" },
    ]);
    await page.goto("/admin");
    const submit = page.getByRole("button", { name: "+ Gerar convite" });
    await submit.evaluate((el: HTMLElement) => {
      el.click();
      el.click();
    });
    await page.waitForTimeout(800);

    const after = await (
      await request.get("/api/admin/invites", { headers: adminHeaders })
    ).json();
    expect(after.invites.length - countBefore).toBe(1);
  });
});

// anilistId fora da faixa usada por outras fixtures — anime dedicado só
// pra estes testes de editor/validação, sem interferir com outros specs.
const EDITOR_ANIME_ANILIST_ID = 900501;

test.describe("Epic 18 — 5ª rodada — editores inline", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: EDITOR_ANIME_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: EDITOR_ANIME_ANILIST_ID,
        titleRomaji: "Anime Pra Testar Editores Inline",
        titlePortuguese: null,
        anidbId: null,
      },
      update: { titlePortuguese: null, anidbId: null },
    });
    animeId = anime.id;
    await prisma.platformLink.deleteMany({ where: { animeId } });
    await prisma.$disconnect();
  });

  test("cancelar um editor inline restaura o valor salvo, não o rascunho digitado", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);

    await page.getByRole("button", { name: "Adicionar título em português" }).click();
    const input = page.getByPlaceholder("título em português (opcional)");
    await input.fill("Rascunho não salvo");
    await page.getByRole("button", { name: "cancelar" }).click();

    // Reabre o mesmo editor — o gatilho continua "Adicionar..." porque
    // nada foi salvo, e o campo não deve trazer o rascunho cancelado.
    await page.getByRole("button", { name: "Adicionar título em português" }).click();
    await expect(page.getByPlaceholder("título em português (opcional)")).toHaveValue("");
  });

  test("ID da AniDB não numérico mostra erro e não salva", async ({ page, request }) => {
    await page.goto(`/anime/${animeId}`);

    await page.getByRole("button", { name: "Vincular ID da AniDB" }).click();
    await page.getByPlaceholder("ID numérico (ex: 15617)").fill("abc123xyz");
    await page.getByRole("button", { name: "Salvar" }).click();

    await expect(page.getByText("ID da AniDB deve ser um número inteiro positivo")).toBeVisible();
    // O formulário continua aberto (não fechou como se tivesse salvo).
    await expect(page.getByPlaceholder("ID numérico (ex: 15617)")).toBeVisible();

    const res = await request.get("/api/anime");
    const data = await res.json();
    const anime = data.animes.find((a: { id: string }) => a.id === animeId);
    expect(anime.anidbId).toBeNull();
  });

  test("URL de plataforma inválida mostra erro e não cria o link", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);

    const linksSection = page.getByTestId("platform-links");
    await linksSection.getByTestId("platform-link-add-toggle").click();
    await linksSection.getByTestId("platform-url-input").fill("não é uma url válida");
    await linksSection.getByTestId("platform-link-submit").click();

    await expect(linksSection.getByText("URL inválida")).toBeVisible();
    await expect(
      linksSection.getByText("Nenhuma plataforma vinculada ainda.")
    ).toBeVisible();
  });
});

// Sessão fixa dedicada, só usada neste teste — nunca a TEST_SESSION_TOKEN
// compartilhada, já que o teste deleta a própria sessão no meio do teste
// (deletar a sessão padrão quebraria todo o resto da suíte).
const EXPIRING_SESSION_TOKEN =
  "e401000000000000000000000000000000000000000000000000000000001";
const EXPIRING_USER_EMAIL = "e2e-round5-expiring@test.local";

test.describe("Epic 18 — 5ª rodada — sessão invalidada em uso", () => {
  test.use({
    storageState: {
      cookies: [
        {
          name: SESSION_COOKIE_NAME,
          value: EXPIRING_SESSION_TOKEN,
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

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.upsert({
      where: { email: EXPIRING_USER_EMAIL },
      create: {
        email: EXPIRING_USER_EMAIL,
        passwordHash: "e2e-fixture-not-a-real-hash",
        passwordSalt: "e2e-fixture-not-a-real-salt",
        displayName: "E2E Round5 Expiring",
      },
      update: {},
    });
    await prisma.session.upsert({
      where: { token: EXPIRING_SESSION_TOKEN },
      create: {
        token: EXPIRING_SESSION_TOKEN,
        userId: user.id,
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
      update: { expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000) },
    });
    await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: 900502 } },
      create: { userId: user.id, anilistId: 900502, titleRomaji: "Anime Da Sessão Expirando" },
      update: {},
    });
    await prisma.$disconnect();
  });

  test("sessão apagada em uso reflete deslogado no cabeçalho sem precisar navegar", async ({ page }) => {
    await page.goto("/minha-lista");
    await expect(page.getByText("E2E Round5 Expiring")).toBeVisible();
    const star = page.getByRole("button", { name: "Adicionar aos favoritos" }).first();
    await expect(star).toBeVisible();

    // Invalida a sessão "por trás", como expiração/logout em outra aba —
    // a aba atual não sabe disso ainda.
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.session.deleteMany({ where: { token: EXPIRING_SESSION_TOKEN } });
    await prisma.$disconnect();

    // Qualquer ação autenticada que agora volte 401 precisa refletir no
    // cabeçalho na hora, sem precisar de uma navegação nova.
    await star.click();
    await expect(page.getByRole("link", { name: "Entrar" })).toBeVisible();
    await expect(page.getByText("E2E Round5 Expiring")).toBeHidden();
  });
});
