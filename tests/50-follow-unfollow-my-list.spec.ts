import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// F4 (D-02 aprovada): Minha Lista sem consumo — agrupada por próximo
// lançamento, com busca/ordenação — e "Deixar de acompanhar" com diálogo.
const WITH_RELEASE_ID = 905000;
const NO_RELEASE_ID = 905001;
const UNFOLLOW_ID = 905002;

test.describe("Minha Lista (Figma 8:2608) e deixar de acompanhar", () => {
  let prisma: PrismaClient;
  let userId: string;
  let unfollowAnimeId: string;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    userId = user.id;

    for (const [anilistId, titleRomaji] of [
      [WITH_RELEASE_ID, "Lista Com Lancamento Confirmado"],
      [NO_RELEASE_ID, "Lista Sem Previsao Nenhuma"],
    ] as const) {
      await prisma.anime.upsert({
        where: { userId_anilistId: { userId, anilistId } },
        create: { userId, anilistId, titleRomaji, genres: "" },
        update: {},
      });
    }
    await prisma.airingScheduleEntry.upsert({
      where: { anilistId_episode: { anilistId: WITH_RELEASE_ID, episode: 7 } },
      create: {
        anilistId: WITH_RELEASE_ID,
        episode: 7,
        airingAt: new Date(Date.now() + 3 * 24 * 3600 * 1000),
        titleRomaji: "Lista Com Lancamento Confirmado",
      },
      update: { airingAt: new Date(Date.now() + 3 * 24 * 3600 * 1000) },
    });
  });

  test.beforeEach(async () => {
    // Recria a linha que o teste de remoção apaga.
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId, anilistId: UNFOLLOW_ID } },
      create: { userId, anilistId: UNFOLLOW_ID, titleRomaji: "Anime Para Deixar De Acompanhar", genres: "" },
      update: {},
    });
    unfollowAnimeId = anime.id;
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("não mostra nenhuma métrica de consumo: sem status, sem 'x/y eps', sem 'Continuar assistindo'", async ({ page }) => {
    await page.goto("/minha-lista");
    await expect(page.getByRole("heading", { level: 1, name: "Minha Lista" })).toBeVisible();
    await expect(page.getByTestId("list-count")).toContainText("acompanhando");

    // A própria lista (sem as abas: "Pausados" é a aba de 28/10 com as obras encerradas não terminadas, a pedido).
    const body = page.locator("main");
    await expect(page.getByTestId("tab-paused")).toContainText("Pausados");
    for (const forbidden of ["Continuar assistindo", "Quero assistir", "Assistindo", "Abandonado", /Pausad[oa]/]) {
      await expect(body).not.toContainText(forbidden);
    }
    await expect(body).not.toContainText(/\d+\/\d+ eps/);
  });

  test("agrupa por próximo lançamento e deixa quem não tem data em 'Data não definida'", async ({ page }) => {
    await page.goto("/minha-lista");

    const withRelease = page.getByTestId("anime-card-" + (await prisma.anime.findFirstOrThrow({ where: { userId, anilistId: WITH_RELEASE_ID } })).id);
    await expect(withRelease.getByTestId("card-next")).toContainText("Episódio 07");

    const unknownGroup = page.getByTestId("group-unknown");
    await expect(unknownGroup).toContainText("Data não definida");
    await expect(unknownGroup).toContainText("Lista Sem Previsao Nenhuma");
    await expect(unknownGroup).not.toContainText("Lista Com Lancamento Confirmado");
  });

  test("busca filtra a própria lista e mostra mensagem quando nada bate", async ({ page }) => {
    await page.goto("/minha-lista");
    const search = page.getByLabel("Buscar na minha lista");

    await search.fill("Sem Previsao");
    await expect(page.getByRole("button", { name: "Lista Sem Previsao Nenhuma" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Lista Com Lancamento Confirmado" })).toHaveCount(0);

    await search.fill("zzzz-nao-existe");
    await expect(page.getByText("Nenhum anime da sua lista bate com essa busca.")).toBeVisible();
  });

  test("ordenar por título troca o agrupamento por uma lista única em ordem alfabética", async ({ page }) => {
    await page.goto("/minha-lista");
    // Repete a escolha até a lista trocar: numa lista grande a hidratação pode terminar depois do primeiro clique.
    await expect(async () => {
      await page.getByTestId("sort-select").selectOption("title");
      await expect(page.getByTestId("group-all")).toContainText("Em ordem alfabética", { timeout: 1500 });
    }).toPass({ timeout: 15_000 });
  });

  test("detalhe do anime não tem editor de progresso, status nem nota da pessoa (só a nota do site)", async ({ page }) => {
    await page.goto(`/anime/${unfollowAnimeId}`);
    await expect(page.getByTestId("unfollow-button")).toBeVisible();
    for (const forbidden of ["Quero assistir", "Assistindo", "Marcar como finalizado", "Sua nota"]) {
      await expect(page.locator("main, body").first()).not.toContainText(forbidden);
    }
    // A nota que aparece é a do site (Epic 42), não um campo para a pessoa editar aqui.
    await expect(page.getByTestId("site-score")).toContainText("Nota do site");
  });

  test("a API de progresso foi removida", async ({ request }) => {
    const res = await request.patch(`/api/anime/${unfollowAnimeId}/progress`, { data: { episodeProgress: 1 } });
    expect([404, 405]).toContain(res.status());
  });

  test("Deixar de acompanhar: Cancelar não remove; confirmar remove e volta para Minha Lista", async ({ page, request }) => {
    await page.goto(`/anime/${unfollowAnimeId}`);

    await page.getByTestId("unfollow-button").click();
    const dialog = page.getByRole("dialog", { name: "Remover acompanhamento?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("deixam sua agenda");
    await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();

    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    expect((await request.get(`/api/anime/${unfollowAnimeId}`)).status()).toBe(200);

    await page.getByTestId("unfollow-button").click();
    await page.getByTestId("unfollow-confirm").click();
    await expect(page).toHaveURL(/\/minha-lista$/);
    expect((await request.get(`/api/anime/${unfollowAnimeId}`)).status()).toBe(404);
    await expect(page.getByText("Anime Para Deixar De Acompanhar")).toHaveCount(0);
  });
});
