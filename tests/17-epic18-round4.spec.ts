import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_USER_EMAIL } from "./test-auth";

test.describe("Epic 18 — 4ª rodada de auditoria de UX/UI — página 404", () => {
  test("usuário inexistente cai numa 404 com o cabeçalho do app, não a padrão do Next", async ({
    page,
  }) => {
    const res = await page.goto("/users/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("link", { name: "Anime Hub" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Voltar para a home" })).toBeVisible();
  });

  test("anime inexistente cai numa 404 com o cabeçalho do app", async ({ page }) => {
    const res = await page.goto("/anime/does-not-exist");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("link", { name: "Anime Hub" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  });

  test("rota inexistente qualquer também cai na 404 estilizada", async ({ page }) => {
    const res = await page.goto("/esta-rota-nao-existe");
    expect(res?.status()).toBe(404);
    await expect(page.getByRole("link", { name: "Anime Hub" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Página não encontrada" })).toBeVisible();
  });
});

// Terceira e quarta sessões fixas, só usadas neste arquivo — A não segue
// ninguém, B já tem posts, pra testar seguir A→B a partir das sugestões do
// Feed (achado real da 4ª rodada: o refetch corria na frente do PATCH de
// seguir e buscava o estado antigo do servidor).
const FOLLOWER_SESSION_TOKEN =
  "f0110000000000000000000000000000000000000000000000000000000001";
const FOLLOWER_EMAIL = "e2e-round4-follower@test.local";
const FOLLOWED_SESSION_TOKEN =
  "f0110000000000000000000000000000000000000000000000000000000002";
const FOLLOWED_EMAIL = "e2e-round4-followed@test.local";

test.describe("Epic 18 — 4ª rodada — seguir a partir das sugestões do Feed", () => {
  let followedUserId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const baseUser = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const baseAnime = await prisma.anime.findFirstOrThrow({ where: { userId: baseUser.id } });

    const follower = await prisma.user.upsert({
      where: { email: FOLLOWER_EMAIL },
      create: {
        email: FOLLOWER_EMAIL,
        passwordHash: "e2e-fixture-not-a-real-hash",
        passwordSalt: "e2e-fixture-not-a-real-salt",
        displayName: "E2E Round4 Follower",
      },
      update: {},
    });
    await prisma.session.upsert({
      where: { token: FOLLOWER_SESSION_TOKEN },
      create: {
        token: FOLLOWER_SESSION_TOKEN,
        userId: follower.id,
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
      update: {},
    });
    // Não segue ninguém — reseta caso uma rodada anterior tenha deixado
    // algum follow.
    await prisma.follow.deleteMany({ where: { followerId: follower.id } });

    const followed = await prisma.user.upsert({
      where: { email: FOLLOWED_EMAIL },
      create: {
        email: FOLLOWED_EMAIL,
        passwordHash: "e2e-fixture-not-a-real-hash",
        passwordSalt: "e2e-fixture-not-a-real-salt",
        displayName: "E2E Round4 Followed",
      },
      update: {},
    });
    followedUserId = followed.id;
    await prisma.session.upsert({
      where: { token: FOLLOWED_SESSION_TOKEN },
      create: {
        token: FOLLOWED_SESSION_TOKEN,
        userId: followed.id,
        expiresAt: new Date(Date.now() + 365 * 24 * 3600 * 1000),
      },
      update: {},
    });
    // Garante que "followed" não seja seguido por "follower" ainda, e que
    // tenha ao menos 1 post já publicado antes do teste.
    await prisma.follow.deleteMany({ where: { followerId: follower.id, followingId: followed.id } });
    await prisma.anime.upsert({
      where: { userId_anilistId: { userId: followed.id, anilistId: baseAnime.anilistId as number } },
      create: { userId: followed.id, anilistId: baseAnime.anilistId, titleRomaji: baseAnime.titleRomaji },
      update: {},
    });
    await prisma.post.deleteMany({ where: { userId: followed.id } });
    await prisma.post.create({
      data: {
        userId: followed.id,
        anilistId: baseAnime.anilistId,
        animeTitleRomaji: baseAnime.titleRomaji,
        body: "Post de quem vai ser seguido a partir das sugestões",
      },
    });

    await prisma.$disconnect();
  });

  test.use({
    storageState: {
      cookies: [
        {
          name: SESSION_COOKIE_NAME,
          value: FOLLOWER_SESSION_TOKEN,
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

  test("seguir alguém pelas sugestões da aba Seguindo já mostra os posts dela, sem precisar recarregar", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Seguindo" }).click();

    await expect(page.getByText(/ainda não segue ninguém/)).toBeVisible();
    const suggestionRow = page.getByText("E2E Round4 Followed").locator("..");
    await expect(suggestionRow.getByRole("button", { name: "Seguir" })).toBeVisible();

    const [followResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes(`/api/users/${followedUserId}/follow`)),
      suggestionRow.getByRole("button", { name: "Seguir" }).click(),
    ]);
    expect(followResponse.ok()).toBe(true);

    // Sem nenhum reload — a lista de posts precisa refletir o novo follow
    // sozinha.
    await expect(
      page.getByText("Post de quem vai ser seguido a partir das sugestões")
    ).toBeVisible();
    await expect(page.getByText(/ainda não segue ninguém/)).toBeHidden();
  });
});
