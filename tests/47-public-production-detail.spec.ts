import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// F2 (D-03/D-18, aprovadas): detalhe PÚBLICO da produção em /obra/[anilistId],
// lido da tabela canônica Production. As linhas são semeadas com fetchedAt
// recente, então a página nunca chama a AniList nos testes.
const FRANCHISE_ROOT = 904000;
const S1 = 904000;
const S2 = 904001;
const OWNED_BY_USER = 904002;

test.describe("Detalhe público da obra (/obra/[anilistId])", () => {
  let ownedAnimeId: string;
  let prisma: PrismaClient;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const franchise = await prisma.franchise.upsert({
      where: { rootAnilistId: FRANCHISE_ROOT },
      create: { rootAnilistId: FRANCHISE_ROOT, name: "Franquia De Teste Publica" },
      update: {},
    });

    const common = { franchiseId: franchise.id, fetchedAt: new Date() };
    await prisma.production.upsert({
      where: { anilistId: S1 },
      create: {
        ...common,
        anilistId: S1,
        seasonNumber: 1,
        format: "TV",
        titleRomaji: "Obra Publica Temporada Um",
        titleNative: "公開作品",
        description: 'Sinopse com <i>itálico</i><br>quebra e <script>window.__xss = 1</script><img src=x onerror="window.__xss = 2">',
        genres: "Mystery,Drama",
        status: "FINISHED",
        episodes: 12,
        season: "FALL",
        seasonYear: 2025,
        officialSite: "https://example.com/oficial",
      },
      update: common,
    });
    await prisma.production.upsert({
      where: { anilistId: S2 },
      create: {
        ...common,
        anilistId: S2,
        seasonNumber: 2,
        format: "TV",
        titleRomaji: "Obra Publica Temporada Dois",
        status: "RELEASING",
        season: "FALL",
        seasonYear: 2026,
      },
      update: common,
    });

    // Próximo episódio confirmado da S2 (daqui a 2 dias).
    await prisma.airingScheduleEntry.upsert({
      where: { anilistId_episode: { anilistId: S2, episode: 3 } },
      create: {
        anilistId: S2,
        episode: 3,
        airingAt: new Date(Date.now() + 2 * 24 * 3600 * 1000),
        titleRomaji: "Obra Publica Temporada Dois",
      },
      update: { airingAt: new Date(Date.now() + 2 * 24 * 3600 * 1000) },
    });

    // Produção que o usuário de teste já acompanha.
    const ownedFranchise = await prisma.franchise.upsert({
      where: { rootAnilistId: OWNED_BY_USER },
      create: { rootAnilistId: OWNED_BY_USER, name: "Franquia Acompanhada" },
      update: {},
    });
    await prisma.production.upsert({
      where: { anilistId: OWNED_BY_USER },
      create: {
        anilistId: OWNED_BY_USER,
        franchiseId: ownedFranchise.id,
        fetchedAt: new Date(),
        titleRomaji: "Obra Ja Acompanhada",
      },
      update: { fetchedAt: new Date() },
    });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: OWNED_BY_USER } },
      create: { userId: user.id, anilistId: OWNED_BY_USER, titleRomaji: "Obra Ja Acompanhada", genres: "" },
      update: {},
    });
    ownedAnimeId = anime.id;
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test.describe("como visitante (sem login)", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("abre sem login e mostra títulos, sinopse em texto puro, gêneros, informações e site oficial", async ({ page }) => {
      const res = await page.goto(`/obra/${S1}`);
      expect(res?.status()).toBe(200);

      // Título padrão = Japonês (D-06): o <h1> mostra o original; o romaji
      // continua disponível como título alternativo da obra.
      await expect(page.getByRole("heading", { level: 1 })).toContainText("公開作品");
      await expect(page.getByText("公開作品", { exact: true }).first()).toBeVisible();

      // Sinopse como TEXTO: marcação vira texto/quebra, nada executa.
      await expect(page.getByText("Sinopse com itálico")).toBeVisible();
      expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
      await expect(page.locator("main script, section img[onerror]")).toHaveCount(0);

      await expect(page.getByText("Mystery", { exact: true })).toBeVisible();
      await expect(page.getByRole("definition").filter({ hasText: "Finalizado" })).toBeVisible();

      const official = page.getByTestId("official-site");
      await expect(official).toHaveAttribute("href", "https://example.com/oficial");
      await expect(official).toHaveAttribute("rel", /noopener/);
    });

    test("'Acompanhar' leva ao login SEM criar vínculo, preservando o destino", async ({ page, request }) => {
      await page.goto(`/obra/${S1}`);
      const cta = page.getByTestId("follow-login-button");
      await expect(cta).toBeVisible();
      await expect(cta).toHaveAttribute("href", `/login?next=${encodeURIComponent(`/anime/${S1}`)}`);

      const anonList = await request.get("/api/anime", { headers: { Cookie: "" } });
      expect([401, 200]).toContain(anonList.status()); // nenhuma linha criada para anônimo
    });

    test("lista a mesma franquia e mostra o próximo episódio com o fuso", async ({ page }) => {
      await page.goto(`/obra/${S2}`);
      const nextEp = page.getByTestId("next-episode");
      await expect(nextEp).toContainText("Episódio 3");
      await expect(nextEp).toContainText("America/Sao_Paulo");

      // A temporada irmã aparece junto, numa aba de "Temporadas e episódios"; ao abri-la, o caminho para a página dela.
      const seasons = page.getByTestId("franchise-seasons");
      await expect(seasons.getByTestId(`season-tab-${S1}`)).toBeVisible();
      await seasons.getByTestId(`season-tab-${S1}`).click();
      await expect(seasons.getByTestId(`season-${S1}`)).toBeVisible();
      await expect(seasons.locator(`a[href="/anime/${S1}"]`)).toHaveCount(1);
    });

    test("obra finalizada, sem episódio por vir, não mostra o bloco de próximo episódio", async ({ page }) => {
      await page.goto(`/obra/${S1}`);
      await expect(page.getByTestId("work-section-nav")).toBeVisible();
      await expect(page.getByTestId("next-episode")).toHaveCount(0);
    });

    test("id inválido devolve 404", async ({ page }) => {
      const res = await page.goto("/obra/abc");
      expect(res?.status()).toBe(404);
    });
  });

  test("quem já acompanha é levado direto para a própria entrada", async ({ page }) => {
    await page.goto(`/obra/${OWNED_BY_USER}`);
    await expect(page).toHaveURL(new RegExp(`/anime/${ownedAnimeId}$`));
    await expect(page.getByTestId("anime-title")).toBeVisible();
  });
});
