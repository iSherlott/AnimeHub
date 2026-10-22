import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Toda obra vive em /anime/<id>: o mesmo desenho para quem acompanha e para quem não; /obra/<id> só encaminha.
// As temporadas da obra aparecem juntas na descrição, com a sinopse de cada uma.
const S1 = 981001;
const S2 = 981002;
const T1 = 981003; // sem franquia: só o catálogo (achada pelo título)
const T2 = 981004;
const ONLY = 981005; // obra sem outras temporadas
const ALL = [S1, S2, T1, T2, ONLY];

test.describe.serial("Obra unificada em /anime e temporadas juntas", () => {
  let prisma: PrismaClient;
  let userId: string;

  async function clean() {
    await prisma.anime.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: ALL } } });
    await prisma.catalogEntry.deleteMany({ where: { anilistId: { in: ALL } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();
    const franchise = await prisma.franchise.create({ data: { rootAnilistId: S1, name: "Franquia Round81" } });
    const prod = (anilistId: number, titleRomaji: string, seasonNumber: number, status: string, description: string, seasonYear: number) =>
      prisma.production.create({ data: { anilistId, franchiseId: franchise.id, titleRomaji, seasonNumber, status, description, season: "FALL", seasonYear, format: "TV", episodes: 12, genres: "Comedy", streamingLinksJson: "[]", fetchedAt: new Date() } });
    await prod(S1, "Franquia Round81", 1, "FINISHED", "Sinopse da primeira temporada Round81.", 2025);
    await prod(S2, "Franquia Round81 Season 2", 2, "RELEASING", "Sinopse da segunda temporada Round81.", 2026);
    for (const [anilistId, titleRomaji, seasonYear, description] of [
      [S1, "Franquia Round81", 2025, "Sinopse da primeira temporada Round81."],
      [S2, "Franquia Round81 Season 2", 2026, "Sinopse da segunda temporada Round81."],
    ] as const) {
      await prisma.catalogEntry.create({ data: { anilistId, titleRomaji, season: "FALL", seasonYear, description, genres: "Comedy", source: "anilist", onPlatform: true } });
    }
    // Sem franquia: só no catálogo; a ligação é pelo título ("2nd Season").
    await prisma.catalogEntry.create({ data: { anilistId: T1, titleRomaji: "Titulo Solto Round81", season: "SPRING", seasonYear: 2026, description: "Primeira do título solto.", genres: "Drama", source: "anilist", onPlatform: true } });
    await prisma.catalogEntry.create({ data: { anilistId: ONLY, titleRomaji: "Unico Round81", season: "FALL", seasonYear: 2026, description: "Obra de temporada única.", genres: "Drama", source: "anilist", onPlatform: true } });
    await prisma.catalogEntry.create({ data: { anilistId: T2, titleRomaji: "Titulo Solto Round81 2nd Season", season: "FALL", seasonYear: 2026, description: "Segunda do título solto.", genres: "Drama", source: "anilist", onPlatform: true } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("/obra/<id> encaminha para /anime/<id>", async ({ page }) => {
    await page.goto(`/obra/${S2}`);
    await expect(page).toHaveURL(new RegExp(`/anime/${S2}$`));
    await expect(page.getByTestId("anime-title")).toContainText("Franquia Round81 Season 2");
    const res = await page.request.get(`/obra/${S2}`, { maxRedirects: 0 });
    expect(res.status()).toBe(308);
    expect(res.headers().location).toContain(`/anime/${S2}`);
  });

  test("a obra de quem ainda não acompanha tem o mesmo desenho: capa, temporadas, onde assistir, discussões", async ({ page }) => {
    await page.goto(`/anime/${S2}`);
    await expect(page.getByTestId("follow-button")).toBeVisible();
    await expect(page.getByTestId("my-watch-source-hint")).toBeVisible();
    await expect(page.getByTestId("discussions")).toBeVisible();
    await expect(page.getByTestId("franchise-seasons")).toBeVisible();
  });

  test("as temporadas aparecem juntas, em abas e em ordem (a atual já aberta); cada aba traz a sinopse dela", async ({ page }) => {
    await page.goto(`/anime/${S2}`);
    const seasons = page.getByTestId("franchise-seasons");
    const tabs = seasons.getByRole("tab");
    await expect(tabs).toHaveCount(2);
    await expect(tabs.nth(0)).toHaveText("Temporada 1");
    await expect(tabs.nth(1)).toHaveText("Temporada 2 · atual");
    await expect(tabs.nth(1)).toHaveAttribute("aria-selected", "true");
    await expect(seasons.getByTestId(`season-${S2}`)).toContainText("você está aqui");
    await expect(page.getByTestId("synopsis").first()).toContainText("segunda temporada Round81"); // a da atual já está em "Sinopse"
    await expect(page.getByTestId(`season-synopsis-${S2}`)).toHaveCount(0); // sem repetir a sinopse da atual
    await expect(page.getByTestId(`season-synopsis-${S1}`)).toHaveCount(0); // a outra aba ainda não foi aberta
    await tabs.nth(0).click();
    await expect(tabs.nth(0)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId(`season-synopsis-${S1}`)).toContainText("primeira temporada Round81");
    await expect(seasons.getByRole("link", { name: "Abrir a Temporada 1" })).toHaveAttribute("href", `/anime/${S1}`);
  });

  test("sem franquia da AniList, o mesmo título com outro número de temporada também se junta", async ({ page }) => {
    await page.goto(`/anime/${T2}`);
    const seasons = page.getByTestId("franchise-seasons");
    await expect(seasons.getByRole("tab")).toHaveCount(2);
    await expect(seasons.getByRole("tab").nth(0)).toHaveText("Temporada 1");
    await expect(seasons.getByRole("tab").nth(1)).toHaveText("Temporada 2 · atual");
  });

  test("quem já acompanha é levado da URL numérica para a própria página, com as temporadas também", async ({ page }) => {
    const mine = await prisma.anime.create({ data: { userId, anilistId: S2, titleRomaji: "Franquia Round81 Season 2", status: "RELEASING", seriesKey: "franquia round81", seasonNumber: 2 } });
    try {
      await page.goto(`/anime/${S2}`);
      await expect(page).toHaveURL(new RegExp(`/anime/${mine.id}$`));
      await expect(page.getByTestId("anime-title")).toBeVisible();
      await expect(page.getByTestId("franchise-seasons").getByRole("tab")).toHaveCount(2);
      await expect(page.getByTestId("discussions")).toBeVisible();
    } finally {
      await prisma.anime.delete({ where: { id: mine.id } });
    }
  });

  test("a primeira temporada também mostra as seguintes, e uma obra de temporada única não mostra a seção", async ({ page }) => {
    await page.goto(`/anime/${T1}`);
    await expect(page.getByTestId("franchise-seasons").getByRole("tab")).toHaveCount(2);
    await page.goto(`/anime/${ONLY}`);
    await expect(page.getByTestId("anime-title")).toBeVisible();
    await expect(page.getByTestId("franchise-seasons")).toHaveCount(0);
  });
});
