import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const META_ANILIST_ID = 902000;
const PROGRESS_ANILIST_ID = 902001;
const ACCORDION_ANILIST_ID = 902002;
const COMMENTS_ANILIST_ID = 902003;
const FINISH_SYNC_ANILIST_ID = 902004;

test.describe("Epic 27 (lote 1) — metadados atrás de 1 ícone único", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: META_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: META_ANILIST_ID,
        titleRomaji: "Anime Pra Testar Popover De Metadados",
        description: "<p>Descrição original em inglês.</p>",
        descriptionPortuguese: null,
        titlePortuguese: null,
        anidbId: null,
        genres: "",
      },
      update: { description: "<p>Descrição original em inglês.</p>", descriptionPortuguese: null },
    });
    animeId = anime.id;
    await prisma.$disconnect();
  });

  test("ícone único abre popover com os 4 editores de metadado", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);

    await expect(page.getByRole("button", { name: "Editar agrupamento de temporada" })).toHaveCount(0);
    await page.getByRole("button", { name: "Editar metadados" }).click();

    await expect(page.getByRole("button", { name: "Editar agrupamento de temporada" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Adicionar título em português" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Adicionar descrição em português" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Vincular ID da AniDB" })).toBeVisible();
  });

  test("descrição em português salva e passa a exibir no lugar da original quando a preferência é PT", async ({
    page,
  }) => {
    await page.goto(`/anime/${animeId}`);
    await page.getByRole("button", { name: "Editar metadados" }).click();
    await page.getByRole("button", { name: "Adicionar descrição em português" }).click();
    await page
      .getByPlaceholder("descrição em português (opcional)")
      .fill("Descrição em português salva pelo teste.");
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("button", { name: "Editar descrição em português" })).toBeVisible();

    // Fecha o popover de metadados — ainda aberto, e o backdrop invisível
    // dele intercepta cliques no resto da página (achado real deste lote,
    // visto 1º num script de verificação ao vivo).
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "Editar agrupamento de temporada" }).waitFor({ state: "hidden" });

    // Preferência padrão é "en" — ainda mostra a original em inglês.
    await expect(page.getByText("Descrição original em inglês.")).toBeVisible();

    // Troca pra português via o menu de idioma — que pra quem está logado
    // (esta suíte sempre está) mora dentro do menu de conta (avatar) desde
    // o lote 3 do Epic 27, não mais num ícone de engrenagem separado.
    await page.getByRole("button", { name: "Menu da conta" }).click();
    await page.getByRole("menuitem", { name: "PT" }).click();

    await expect(page.getByText("Descrição em português salva pelo teste.")).toBeVisible();
    await expect(page.getByText("Descrição original em inglês.")).toHaveCount(0);
  });
});

test.describe("Epic 27 (lote 1) — status simplificado (botão de finalizado)", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: PROGRESS_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: PROGRESS_ANILIST_ID,
        titleRomaji: "Anime Pra Testar Status Simplificado",
        episodes: 12,
        genres: "",
      },
      update: {},
    });
    animeId = anime.id;
    await prisma.watchProgress.deleteMany({ where: { animeId } });
    await prisma.$disconnect();
  });

  test("dropdown de 5 status não existe mais na página", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    await expect(page.getByText("Quero assistir")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Marcar como finalizado" })).toBeVisible();
  });

  test("aumentar episódio a partir de 0 infere WATCHING sozinho, sem UI manual pra status", async ({
    page,
    request,
  }) => {
    await page.goto(`/anime/${animeId}`);
    await page.getByRole("button", { name: "Aumentar episódio" }).click();
    await expect(page.getByText("Episódio 1 / 12")).toBeVisible();

    const res = await request.get("/api/anime");
    const data = await res.json();
    const anime = data.animes.find((a: { id: string }) => a.id === animeId);
    expect(anime.progress?.status).toBe("WATCHING");
  });

  test("marcar/desmarcar 'Finalizado' alterna COMPLETED e volta pro status anterior", async ({ page, request }) => {
    await page.goto(`/anime/${animeId}`);

    await page.getByRole("button", { name: "Marcar como finalizado" }).click();
    await expect(page.getByRole("button", { name: "Finalizado" })).toBeVisible();
    let res = await request.get("/api/anime");
    let data = await res.json();
    let anime = data.animes.find((a: { id: string }) => a.id === animeId);
    expect(anime.progress?.status).toBe("COMPLETED");

    await page.getByRole("button", { name: "Finalizado" }).click();
    await expect(page.getByRole("button", { name: "Marcar como finalizado" })).toBeVisible();
    res = await request.get("/api/anime");
    data = await res.json();
    anime = data.animes.find((a: { id: string }) => a.id === animeId);
    // episodeProgress já tinha sido incrementado no teste anterior (mesmo
    // anime, mesma suíte serial) — desmarcar finalizado volta pra WATCHING,
    // não PLAN_TO_WATCH, porque episodeProgress > 0.
    expect(anime.progress?.status).toBe("WATCHING");
  });
});

test.describe("Epic 27 (lote 1) — marcar como finalizado sincroniza o progresso de episódio", () => {
  // Achado real da 24ª rodada de auditoria (Epic 18): marcar "Finalizado"
  // só trocava o status — o contador de episódio (e o accordion de
  // episódios logo abaixo) continuavam mostrando progresso parcial,
  // contradizendo o próprio selo "Finalizado" no topo da página.
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: FINISH_SYNC_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: FINISH_SYNC_ANILIST_ID,
        titleRomaji: "Anime Pra Testar Sincronia Do Finalizado",
        episodes: 12,
        genres: "",
      },
      update: {},
    });
    animeId = anime.id;
    await prisma.watchProgress.upsert({
      where: { animeId },
      create: { animeId, status: "WATCHING", episodeProgress: 3 },
      update: { status: "WATCHING", episodeProgress: 3 },
    });
    await prisma.$disconnect();
  });

  test("marcar como finalizado com progresso parcial leva o contador até o total de episódios", async ({
    page,
    request,
  }) => {
    await page.goto(`/anime/${animeId}`);
    await expect(page.getByText("Episódio 3 / 12")).toBeVisible();

    await page.getByRole("button", { name: "Marcar como finalizado" }).click();
    await expect(page.getByRole("button", { name: "Finalizado" })).toBeVisible();
    await expect(page.getByText("Episódio 12 / 12")).toBeVisible();

    const res = await request.get("/api/anime");
    const data = await res.json();
    const anime = data.animes.find((a: { id: string }) => a.id === animeId);
    expect(anime.progress?.status).toBe("COMPLETED");
    expect(anime.progress?.episodeProgress).toBe(12);
  });
});

test.describe("Epic 27 (lote 1) — lista de episódios em accordion fechado por padrão", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: ACCORDION_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: ACCORDION_ANILIST_ID,
        titleRomaji: "Anime Pra Testar Accordion De Episódios",
        genres: "",
      },
      update: {},
    });
    animeId = anime.id;
    await prisma.episode.deleteMany({ where: { animeId } });
    await prisma.episode.createMany({
      data: [{ animeId, number: 1, seasonNumber: 1, titleRomaji: "Episódio Único" }],
    });
    await prisma.$disconnect();
  });

  test("episódios vêm escondidos até clicar em 'Ver episódios'", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    // O MUI Accordion mantém o conteúdo montado no DOM mesmo fechado (só
    // colapsa a altura) — toHaveCount(0) sempre passaria mesmo se o
    // accordion nunca tivesse fechado nada; not.toBeVisible() é o que
    // realmente confere o estado fechado.
    await expect(page.getByPlaceholder("Buscar episódio...")).not.toBeVisible();
    await expect(page.getByText("Ver episódios (1)")).toBeVisible();

    await page.getByText("Ver episódios (1)").click();
    await expect(page.getByPlaceholder("Buscar episódio...")).toBeVisible();
  });
});

test.describe("Epic 27 (lote 1) — comentários paginados, 'ver mais' e ícone de concluído", () => {
  let animeId: string;
  let adminAnimeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const admin = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-admin@test.local" } });

    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: COMMENTS_ANILIST_ID } },
      create: { userId: user.id, anilistId: COMMENTS_ANILIST_ID, titleRomaji: "Anime Pra Testar Comentários Paginados", genres: "" },
      update: {},
    });
    animeId = anime.id;
    const adminAnime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: admin.id, anilistId: COMMENTS_ANILIST_ID } },
      create: { userId: admin.id, anilistId: COMMENTS_ANILIST_ID, titleRomaji: anime.titleRomaji, genres: "" },
      update: {},
    });
    adminAnimeId = adminAnime.id;

    // TEST_USER já assistiu (COMPLETED) — deve ganhar o ícone nos próprios
    // comentários; admin não, não ganha.
    await prisma.watchProgress.upsert({
      where: { animeId },
      create: { animeId, status: "COMPLETED", episodeProgress: 0 },
      update: { status: "COMPLETED" },
    });
    await prisma.watchProgress.deleteMany({ where: { animeId: adminAnimeId } });

    await prisma.comment.deleteMany({ where: { anilistId: COMMENTS_ANILIST_ID } });
    const base = Date.now() - 20 * 60 * 1000;
    const rows = Array.from({ length: 14 }, (_, i) => ({
      anilistId: COMMENTS_ANILIST_ID,
      userId: i % 2 === 0 ? user.id : admin.id,
      body: i === 13 ? "L".repeat(320) : `Comentário paginado número ${i + 1}`,
      createdAt: new Date(base + i * 60 * 1000),
    }));
    await prisma.comment.createMany({ data: rows });

    await prisma.$disconnect();
  });

  test("página 1 mostra 10 comentários com paginação, página 2 mostra os 5 restantes", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    // exact:true em todo lugar — "número 1" é substring de "número 10"..14,
    // sem isso o teste "passaria" mesmo se a paginação nunca cortasse nada.
    await expect(page.getByText("Comentário paginado número 1", { exact: true })).toBeVisible();
    await expect(page.getByText("Comentário paginado número 10", { exact: true })).toBeVisible();
    await expect(page.getByText("Comentário paginado número 11", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Go to page 2" }).click();
    await expect(page.getByText("Comentário paginado número 11", { exact: true })).toBeVisible();
    await expect(page.getByText("Comentário paginado número 1", { exact: true })).toHaveCount(0);
  });

  test("comentário longo trunca com 'ver mais' e expande ao clicar", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    await page.getByRole("button", { name: "Go to page 2" }).click();

    const longBody = "L".repeat(320);
    await expect(page.getByText(longBody)).toHaveCount(0);
    const seeMore = page.getByRole("button", { name: "ver mais" });
    await expect(seeMore).toBeVisible();
    await seeMore.click();
    await expect(page.getByText(longBody)).toBeVisible();
    await expect(page.getByRole("button", { name: "ver menos" })).toBeVisible();
  });

  test("ícone de 'já assistiu' aparece só pro autor com progresso concluído", async ({ page }) => {
    // Sessão do admin, pra ver os mesmos comentários (mesmo anilistId) sem
    // depender de qual usuário é o "dono" de cada linha de Anime.
    await page.context().addCookies([
      { name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/" },
    ]);
    await page.goto(`/anime/${adminAnimeId}`);

    const testUserComment = page.getByText("Comentário paginado número 1", { exact: true }).locator("..");
    await expect(testUserComment.getByLabel("Já assistiu esse anime")).toBeVisible();

    const adminComment = page.getByText("Comentário paginado número 2", { exact: true }).locator("..");
    await expect(adminComment.getByLabel("Já assistiu esse anime")).toHaveCount(0);
  });
});
