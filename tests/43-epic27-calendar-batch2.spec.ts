import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";
import { todayAtNoonSaoPaulo as todayAtNoon } from "./test-time";

// anilistId fora da faixa usada por outras fixtures.
const OWNED_ANILIST_ID = 903000;
const OTHER_ANILIST_ID = 903001;

test.describe("Epic 27 (lote 2) — calendário: card único + preview no hover", () => {
  let ownedAnimeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });

    const owned = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: OWNED_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: OWNED_ANILIST_ID,
        titleRomaji: "Anime Do Calendario Que Esta Na Lista",
        description: "<p>Sinopse original em inglês do calendário.</p>",
        descriptionPortuguese: null,
        isFavorite: false,
        genres: "",
      },
      update: {
        description: "<p>Sinopse original em inglês do calendário.</p>",
        descriptionPortuguese: null,
        isFavorite: false,
      },
    });
    ownedAnimeId = owned.id;

    await prisma.airingScheduleEntry.deleteMany({
      where: { anilistId: { in: [OWNED_ANILIST_ID, OTHER_ANILIST_ID] } },
    });
    await prisma.airingScheduleEntry.createMany({
      data: [
        {
          anilistId: OWNED_ANILIST_ID,
          episode: 5,
          airingAt: todayAtNoon(),
          titleRomaji: "Anime Do Calendario Que Esta Na Lista",
        },
        {
          anilistId: OTHER_ANILIST_ID,
          episode: 3,
          airingAt: todayAtNoon(),
          titleRomaji: "Anime Do Calendario Fora Da Lista",
        },
      ],
    });

    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    // Desfaz o favorito, caso algum teste tenha marcado — não deixa
    // rastro pra outros arquivos que também leem esse mesmo usuário.
    await prisma.anime.update({ where: { id: ownedAnimeId }, data: { isFavorite: false } });
    await prisma.$disconnect();
  });

  test("item da própria lista tem a barra lateral de destaque (acento) e o de fora não tem barra", async ({ page }) => {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();

    const mineLink = page.getByRole("button", { name: "Anime Do Calendario Que Esta Na Lista" });
    const otherLink = page.getByRole("button", { name: "Anime Do Calendario Fora Da Lista" });
    await expect(mineLink).toBeVisible();
    await expect(otherLink).toBeVisible();

    // Figma 8:2106: o item da lista ganha a barra lateral de acento (e fundo avermelhado); os demais não têm barra.
    await expect(mineLink).toHaveCSS("border-left-width", "3px");
    await expect(mineLink).toHaveCSS("border-left-color", "rgb(255, 22, 79)");
    await expect(otherLink).toHaveCSS("border-left-color", "rgba(0, 0, 0, 0)");
    await expect(mineLink).not.toContainText("PRÓXIMO EPISÓDIO"); // o calendário só avisa "Ao vivo"
  });

  test("hover num item da lista mostra sinopse e o botão Acompanhando, que tira a obra da lista ao clicar", async ({
    page,
  }) => {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();

    const mineLink = page.getByRole("button", { name: "Anime Do Calendario Que Esta Na Lista" });
    await mineLink.hover();

    await expect(page.getByText("Sinopse original em inglês do calendário.")).toBeVisible();
    // Já nasce ligado (a obra está na lista); a remoção real é simulada para não apagar a fixture dos outros testes.
    let deleted: string | null = null;
    await page.route(`**/api/anime/${ownedAnimeId}`, async (route) => {
      if (route.request().method() !== "DELETE") return route.continue();
      deleted = route.request().url();
      await route.fulfill({ status: 200, json: { ok: true } });
    });
    const toggle = page.getByTestId("preview-follow-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(toggle).toContainText("Acompanhando");
    await toggle.click();
    expect(deleted).toContain(`/api/anime/${ownedAnimeId}`);
    // Saiu da lista: o preview passa a oferecer "+ Acompanhar".
    await expect(page.getByRole("button", { name: "+ Acompanhar" })).toBeVisible();
    await expect(page.getByTestId("preview-follow-toggle")).toHaveCount(0);
  });

  test("hover num item de fora da lista mostra 'Ver página da obra' e '+ Acompanhar' em vez de Acompanhando", async ({
    page,
  }) => {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();

    const otherLink = page.getByRole("button", { name: "Anime Do Calendario Fora Da Lista" });
    await otherLink.hover();

    await expect(page.getByText("Sem sinopse — abra pra ver mais.")).toBeVisible();
    const seeMore = page.getByRole("link", { name: "Ver página da obra" });
    await expect(seeMore).toBeVisible();
    await expect(seeMore).toHaveAttribute("href", `/anime/${OTHER_ANILIST_ID}`);
    // "+ Acompanhar" adiciona direto à lista (botão), em vez de abrir a página da obra.
    await expect(page.getByRole("button", { name: "+ Acompanhar" })).toBeVisible();
    await expect(page.getByTestId("preview-follow-toggle")).toHaveCount(0);
  });

  test("descrição do preview acompanha o idioma escolhido, igual à página de detalhe", async ({
    page,
    request,
  }) => {
    await request.patch(`/api/anime/${ownedAnimeId}/description`, {
      data: { descriptionPortuguese: "Sinopse em português do calendário." },
    });

    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();

    // A sinopse é em português por padrão (a salva pela pessoa tem prioridade sobre a tradução automática).
    const mineLink = page.getByRole("button", { name: "Anime Do Calendario Que Esta Na Lista" });
    await mineLink.hover();
    await expect(page.getByText("Sinopse em português do calendário.")).toBeVisible();
    await page.mouse.move(0, 0);

    // Idioma mora dentro do menu de conta pra quem está logado (esta
    // suíte sempre está) desde o lote 3 do Epic 27. Em inglês, vale a original.
    await page.getByRole("button", { name: "Menu da conta" }).click();
    await page.getByRole("menuitem", { name: "EN" }).click();
    // O menu leva um instante para fechar; passar o mouse antes disso cai no fundo do menu e o preview não abre.
    // (o papel "menu" some da árvore de acessibilidade antes: espera o elemento do menu sair de verdade).
    await expect(page.locator(".MuiMenu-root")).toHaveCount(0);
    await page.mouse.move(0, 0);

    await mineLink.hover();
    await expect(page.getByText("Sinopse original em inglês do calendário.")).toBeVisible();

    await request.patch(`/api/anime/${ownedAnimeId}/description`, {
      data: { descriptionPortuguese: null },
    });
  });
});
