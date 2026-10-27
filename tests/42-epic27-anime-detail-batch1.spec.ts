import { test, expect } from "@playwright/test";
import { waitEpisodesStreamed } from "./streaming";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { seedGlobalEpisodes } from "./global-episodes";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures.
const META_ANILIST_ID = 902000;
const ACCORDION_ANILIST_ID = 902002;
const COMMENTS_ANILIST_ID = 902003;

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

  test("descrição em português salva é a sinopse padrão; só com títulos em inglês volta a original", async ({
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

    // A sinopse é em português por padrão (também com títulos em japonês, salvo escolha no perfil).
    await expect(page.getByText("Descrição em português salva pelo teste.")).toBeVisible();
    await expect(page.getByText("Descrição original em inglês.")).toHaveCount(0);

    // Troca pra inglês via o menu de idioma — que pra quem está logado
    // (esta suíte sempre está) mora dentro do menu de conta (avatar) desde
    // o lote 3 do Epic 27, não mais num ícone de engrenagem separado.
    await page.getByRole("button", { name: "Menu da conta" }).click();
    await page.getByRole("menuitem", { name: "EN" }).click();

    await expect(page.getByText("Descrição original em inglês.")).toBeVisible();
    await expect(page.getByText("Descrição em português salva pelo teste.")).toHaveCount(0);
  });
});

// Removidos (D-02): "status simplificado" e "marcar como finalizado" testavam consumo
// (progresso por episódio, tabela arquivada na migração 20261102100000), que deixou de existir. Ver tests/50-follow-unfollow-my-list.spec.ts.

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
    // Episódio global (Fase 4): a linha da agenda da obra.
    await seedGlobalEpisodes(prisma, ACCORDION_ANILIST_ID, { titleRomaji: "Anime Pra Testar Accordion De Episódios" }, [{ number: 1, titleRomaji: "Episódio Único" }]);
    await prisma.$disconnect();
  });

  test("os episódios vêm minimizados: só a contagem aparece, e o botão abre e fecha a linha do tempo", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    await waitEpisodesStreamed(page); // a lista chega em streaming: espera o esqueleto sumir e a troca terminar
    await expect(page.getByTestId("episode-count")).toHaveText("1 episódio");
    const toggle = page.getByTestId("episode-toggle");
    await expect(toggle).toHaveText("Mostrar episódios");
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByPlaceholder("Buscar episódio...")).not.toBeVisible();
    await expect(page.getByTestId("episode-timeline")).not.toBeVisible();

    await toggle.click();
    await expect(toggle).toHaveText("Minimizar episódios");
    await expect(page.getByPlaceholder("Buscar episódio...")).toBeVisible();
    await expect(page.getByTestId("episode-timeline")).toBeVisible();

    await toggle.click();
    await expect(page.getByTestId("episode-timeline")).not.toBeVisible();
  });
});

test.describe("Epic 27 (lote 1) — comentários: a conversa foi para a comunidade; a API não expõe progresso", () => {
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

  test("a página da obra não tem mais comentários nem discussões: a aba Comunidade leva ao cartão da comunidade", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    await expect(page.getByText("Comentário paginado número 1", { exact: true })).toHaveCount(0);
    await expect(page.getByPlaceholder("Escreva um comentário...")).toHaveCount(0);
    await expect(page.getByTestId("discussions")).toHaveCount(0);
    await expect(page.locator("#comunidade")).toHaveCount(1);
  });

  test("progresso de outro usuário não é exposto nos comentários (P-3/P-8)", async ({ page }) => {
    // Sessão do admin, pra ver os mesmos comentários (mesmo anilistId) sem
    // depender de qual usuário é o "dono" de cada linha de Anime. Os comentários
    // não aparecem mais na página da obra (a conversa foi para a comunidade), mas
    // a API continua e não pode expor o progresso de ninguém (audit D-02).
    await page.context().addCookies([
      { name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/" },
    ]);
    const res = await page.request.get(`/api/anime/${adminAnimeId}/comments`);
    const json = await res.json();
    for (const c of json.comments) expect(c.author).not.toHaveProperty("completed");
  });
});
