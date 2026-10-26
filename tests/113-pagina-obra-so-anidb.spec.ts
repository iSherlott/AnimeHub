import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Obras sem AniList ID (só do AniDB ou da Kitsu) ganham página pública em /anime/anidb-<id> e /anime/kitsu-<id>: ficha,
// sinopse, episódios (só o dia) e extras. Acompanhar ainda não dá (depende do AniList ID). Fora da plataforma não abre;
// ligada à AniList, o endereço leva à página da AniList.
const AID = 113901;
const AID_OFF = 113902;
const AID_LINKED = 113903;
const LINKED_ANILIST = 113001;
const KITSU = 113801;
const GENRE = "Round113Genero";
const TITLE = "So AniDB Pagina Round113";

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Página das obras só do AniDB", () => {
  let prisma: PrismaClient;
  let entryId: string;

  async function clean() {
    await deleteCatalogEntries(prisma, { where: { OR: [{ anidbId: { in: [AID, AID_OFF, AID_LINKED] } }, { kitsuId: KITSU }, { anilistId: LINKED_ANILIST }] } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    const base = { source: "anidb", kind: "EPISODE", status: "FINISHED", season: "SPRING", seasonYear: 2025, genres: GENRE };
    const entry = await prisma.catalogEntry.create({ data: { ...base, anidbId: AID, titleRomaji: TITLE, titleNative: "アニDBだけ", episodes: 2, format: "TV", onPlatform: true, description: "Synopsis from AniDB.", descriptionPt: "Sinopse em português do Round113." } });
    entryId = entry.id;
    await prisma.airingScheduleEntry.createMany({
      data: [
        { catalogEntryId: entry.id, anilistId: null, episode: 1, airDate: new Date("2025-04-03T00:00:00Z"), dateCertainty: "DATE_ONLY", source: "anidb", titleRomaji: TITLE, episodeTitleEn: "Primeiro Round113" },
        { catalogEntryId: entry.id, anilistId: null, episode: 2, airDate: new Date("2025-04-10T00:00:00Z"), dateCertainty: "DATE_ONLY", source: "anidb", titleRomaji: TITLE, episodeTitleEn: "Segundo Round113" },
      ],
    });
    await prisma.episodeExtra.create({ data: { catalogEntryId: entry.id, code: "S1", kind: "SPECIAL", number: 1, titleEn: "Especial Round113", airDate: new Date("2025-07-01T00:00:00Z") } });
    await prisma.catalogEntry.create({ data: { ...base, anidbId: AID_OFF, titleRomaji: "Fora Da Plataforma Round113", onPlatform: false } });
    await prisma.catalogEntry.create({ data: { ...base, source: "kitsu", kitsuId: KITSU, titleRomaji: "So Kitsu Round113", onPlatform: true } });
    await prisma.catalogEntry.create({ data: { ...base, source: "anilist", anilistId: LINKED_ANILIST, anidbId: AID_LINKED, titleRomaji: "Ligada Round113", onPlatform: true } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("a página mostra ficha, sinopse, episódios só com o dia e extras; não oferece acompanhar", async ({ page }) => {
    const res = await page.goto(`/anime/anidb-${AID}`);
    expect(res?.status()).toBe(200);
    await expect(page).toHaveTitle(`${TITLE} · Anime Hub`);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByTestId("synopsis")).toContainText("Sinopse em português do Round113.");
    await expect(page.getByTestId("work-card-info")).toContainText("2 episódios");
    await expect(page.getByTestId("schedule-episode-1-title")).toContainText("Primeiro Round113");
    await expect(page.getByTestId("schedule-episode-2-title")).toContainText("Segundo Round113");
    await expect(page.getByTestId("work-extras")).toContainText("Especiais: 1");
    await expect(page.getByTestId("catalog-work-follow-note")).toContainText("Ainda não dá para acompanhar");
    await expect(page.getByRole("button", { name: /Acompanhar/ })).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("pagina-obra-so-anidb.png"), fullPage: true });
  });

  test("obra só da Kitsu também abre; sem episódios cadastrados, diz isso", async ({ page }) => {
    const res = await page.goto(`/anime/kitsu-${KITSU}`);
    expect(res?.status()).toBe(200);
    await expect(page.getByTestId("catalog-work-no-episodes")).toBeVisible();
    await expect(page.getByTestId("work-extras")).toHaveCount(0);
  });

  test("fora da plataforma ou inexistente: 404; ligada à AniList: leva à página da AniList", async ({ request }) => {
    expect((await request.get(`/anime/anidb-${AID_OFF}`)).status()).toBe(404);
    expect((await request.get("/anime/anidb-999999999")).status()).toBe(404);
    expect((await request.get("/anime/anidb-0")).status()).toBe(404);
    const linked = await request.get(`/anime/anidb-${AID_LINKED}`, { maxRedirects: 0 });
    expect(linked.status()).toBe(308);
    expect(linked.headers().location).toMatch(new RegExp(`/anime/${LINKED_ANILIST}$`));
  });

  test("o cartão do Explorar leva à página; a estrela de acompanhar continua desligada", async ({ page }) => {
    await page.goto("/discover");
    await page.getByLabel("Gênero").selectOption(GENRE);
    const card = page.getByTestId(`explore-card-anidb-${AID}`);
    // Padrão do produto: o título em japonês é o principal do cartão.
    await expect(card.getByRole("link", { name: "アニDBだけ" })).toHaveAttribute("href", `/anime/anidb-${AID}`);
    await expect(card.getByRole("button", { name: "+ Acompanhar" })).toBeDisabled();
  });

  test.describe("como administrador", () => {
    test.use({ storageState: adminState });
    test("o detalhe da obra no admin leva à página pública", async ({ page }) => {
      await page.goto(`/admin/obras/${entryId}`);
      await expect(page.getByRole("link", { name: "Página pública" })).toHaveAttribute("href", `/anime/anidb-${AID}`);
    });
  });
});
