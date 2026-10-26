import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Obras sem AniList ID (só do AniDB) também se acompanham: o item de lista não tem AniList ID e a identidade é a obra do
// catálogo. Dá para marcar o andamento e dar nota (entra na nota do site), aparece em Minha Lista e no perfil, o Explorar
// reconhece e acompanha; comunidade fica de fora (409). Ao ligar a obra à AniList, o item ganha o AniList ID — e, se a
// pessoa já tinha a obra da AniList, fica um item só, com o que ela tinha marcado.
const AID = 114901;
const AID_CARD = 114902;
const AID_OFF = 114903;
const TARGET = 114001;
const GENRE = "Round114Genero";
const TITLE = "Acompanhar So AniDB Round114";

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Acompanhar obras só do AniDB", () => {
  let prisma: PrismaClient;
  let anilist: Server;
  let entryId: string;
  let userId: string;
  let adminId: string;
  let animeId: string;

  async function clean() {
    const entries = await prisma.catalogEntry.findMany({ where: { OR: [{ anidbId: { in: [AID, AID_CARD, AID_OFF] } }, { anilistId: TARGET }] }, select: { id: true } });
    const ids = entries.map((e) => e.id);
    await prisma.anime.deleteMany({ where: { OR: [{ catalogEntryId: { in: ids } }, { anilistId: TARGET }] } });
    await prisma.production.deleteMany({ where: { anilistId: TARGET } });
    await deleteCatalogEntries(prisma, { where: { id: { in: ids } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    anilist = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const { variables } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { variables: Record<string, unknown> };
        const wanted = new Set((variables.ids as number[]) ?? []);
        const media = wanted.has(TARGET)
          ? [{ id: TARGET, idMal: null, title: { romaji: "Alvo Round114", english: null, native: null }, coverImage: { extraLarge: null }, bannerImage: null, description: null, episodes: 2, status: "FINISHED", format: "TV", season: "SPRING", seasonYear: 2025, genres: [], averageScore: null, startDate: null, endDate: null, nextAiringEpisode: null, externalLinks: [] }]
          : [];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: false }, media, airingSchedules: [] } } }));
      });
    });
    await new Promise<void>((resolve) => anilist.listen(3197, resolve));
    await clean();
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    const base = { source: "anidb", kind: "EPISODE", status: "FINISHED", season: "SPRING", seasonYear: 2025, genres: GENRE, format: "TV", episodes: 2 };
    const entry = await prisma.catalogEntry.create({ data: { ...base, anidbId: AID, titleRomaji: TITLE, onPlatform: true } });
    entryId = entry.id;
    await prisma.airingScheduleEntry.create({ data: { catalogEntryId: entry.id, anilistId: null, episode: 1, airDate: new Date("2025-04-03T00:00:00Z"), dateCertainty: "DATE_ONLY", source: "anidb", titleRomaji: TITLE, episodeTitleEn: "Primeiro Round114" } });
    await prisma.catalogEntry.create({ data: { ...base, anidbId: AID_CARD, titleRomaji: "Cartao So AniDB Round114", titleNative: "カード114", onPlatform: true } });
    await prisma.catalogEntry.create({ data: { ...base, anidbId: AID_OFF, titleRomaji: "Fora Round114", onPlatform: false } });
  });

  test.afterAll(async () => {
    await clean();
    await new Promise<void>((resolve) => anilist.close(() => resolve()));
    await prisma.$disconnect();
  });

  test("acompanhar pela página da obra: o item nasce sem AniList ID e a página vira a da pessoa", async ({ page }) => {
    await page.goto(`/anime/anidb-${AID}`);
    await expect(async () => {
      await page.getByTestId(`season-follow-anidb-${AID}`).click();
      await expect(page).toHaveURL(/\/anime\/c[a-z0-9]+$/, { timeout: 3000 });
    }).toPass();
    const item = await prisma.anime.findFirstOrThrow({ where: { userId, catalogEntryId: entryId } });
    animeId = item.id;
    expect(item).toMatchObject({ anilistId: null, anidbId: AID, titleRomaji: TITLE, genres: GENRE });
    expect(page.url()).toContain(`/anime/${animeId}`);
    // A página da pessoa: andamento, nota, favorito, "onde eu assisto" e deixar de acompanhar; episódios do catálogo.
    await expect(page.getByTestId(`season-state-anidb-${AID}`)).toBeVisible();
    await expect(page.getByTestId("my-watch-source")).toBeVisible();
    await expect(page.getByTestId("unfollow-button")).toBeVisible();
    await expect(page.getByRole("button", { name: "Adicionar aos favoritos" })).toBeVisible();
    await expect(page.getByTestId("schedule-episode-1-title")).toContainText("Primeiro Round114");
    await page.screenshot({ path: test.info().outputPath("obra-so-anidb-acompanhada.png"), fullPage: true });
    // O endereço público leva quem acompanha à própria página.
    await page.goto(`/anime/anidb-${AID}`);
    await expect(page).toHaveURL(new RegExp(`/anime/${animeId}$`));
  });

  test("terminar e dar nota: a nota entra na nota do site da obra do catálogo", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    await expect(async () => {
      await page.getByTestId(`season-state-anidb-${AID}`).selectOption("FINISHED");
      await expect.poll(async () => (await prisma.anime.findUniqueOrThrow({ where: { id: animeId } })).watchState, { timeout: 2000 }).toBe("FINISHED");
    }).toPass();
    await page.reload();
    await page.getByTestId(`season-score-anidb-${AID}`).locator("label", { hasText: "4 estrelas (nota 8)" }).click();
    await expect(page.getByTestId(`season-score-value-anidb-${AID}`)).toHaveText("Sua nota: 8/10");
    await expect.poll(async () => (await prisma.catalogEntry.findUniqueOrThrow({ where: { id: entryId } })).siteScoreVotes).toBe(1);
  });

  test("Minha Lista e o perfil mostram a obra; o perfil leva à página pública dela", async ({ page }) => {
    await page.goto("/minha-lista");
    await expect(page.getByTestId(`anime-card-${animeId}`).first()).toBeVisible();
    await expect(page.getByTestId(`anime-card-${animeId}`).first().getByRole("link").first()).toHaveAttribute("href", `/anime/${animeId}`);
    await page.goto(`/users/${userId}`);
    await expect(async () => {
      await page.getByTestId("tab-animes").click();
      await expect(page.getByTestId(`profile-anime-anidb-${AID}`)).toBeVisible({ timeout: 3000 });
    }).toPass();
    const tile = page.getByTestId(`profile-anime-anidb-${AID}`);
    await expect(tile).toBeVisible();
    await expect(tile.getByRole("link").first()).toHaveAttribute("href", `/anime/anidb-${AID}`);
  });

  test("API: duplicado, fora da plataforma, chave inválida; comunidade não existe para a obra", async ({ request }) => {
    expect((await request.post("/api/anime", { data: { work: `anidb-${AID}` } })).status()).toBe(409);
    expect((await request.post("/api/anime", { data: { work: `anidb-${AID_OFF}` } })).status()).toBe(403);
    expect((await request.post("/api/anime", { data: { work: "mal-1" } })).status()).toBe(400);
    expect((await request.post("/api/anime", { data: { work: "anidb-999999999" } })).status()).toBe(404);
    expect((await request.get(`/api/anime/${animeId}/comments`)).status()).toBe(409);
    expect((await request.post(`/api/anime/${animeId}/comments`, { data: { body: "oi" } })).status()).toBe(409);
  });

  test("o Explorar reconhece a obra acompanhada e acompanha outra direto do cartão", async ({ page }) => {
    await page.goto("/discover");
    await page.getByLabel("Gênero").selectOption(GENRE);
    await expect(page.getByTestId(`explore-following-anidb-${AID}`)).toHaveAttribute("href", `/anime/${animeId}`);
    await expect(async () => {
      await page.getByTestId(`explore-follow-anidb-${AID_CARD}`).click();
      await expect(page.getByTestId(`explore-following-anidb-${AID_CARD}`)).toBeVisible({ timeout: 3000 });
    }).toPass();
    const card = await prisma.catalogEntry.findUniqueOrThrow({ where: { anidbId: AID_CARD } });
    expect(await prisma.anime.count({ where: { userId, catalogEntryId: card.id, anilistId: null } })).toBe(1);
  });

  test("deixar de acompanhar remove o item (sem AniList ID, sem alertas para limpar)", async ({ request }) => {
    const card = await prisma.catalogEntry.findUniqueOrThrow({ where: { anidbId: AID_CARD } });
    const item = await prisma.anime.findFirstOrThrow({ where: { userId, catalogEntryId: card.id } });
    expect((await request.delete(`/api/anime/${item.id}`)).status()).toBe(200);
    expect(await prisma.anime.count({ where: { id: item.id } })).toBe(0);
  });

  test.describe("ligar à AniList", () => {
    test.use({ storageState: adminState });

    test("o item ganha o AniList ID; quem já tinha a obra da AniList fica com um item só, com o que marcou", async ({ request }) => {
      // O admin acompanha a obra do AniDB (favorita, terminada) e também já tinha a da AniList (sem marcar nada).
      const res = await request.post("/api/anime", { data: { work: `anidb-${AID}` } });
      expect(res.status()).toBe(201);
      const adminDb = (await res.json()).anime.id as string;
      await prisma.anime.update({ where: { id: adminDb }, data: { isFavorite: true, favoritedAt: new Date(), watchState: "FINISHED", userScore: 6, scoredAt: new Date() } });
      const target = await prisma.catalogEntry.create({ data: { anilistId: TARGET, titleRomaji: "Alvo Round114", source: "anilist", onPlatform: false, format: "TV" } });
      const adminTwin = await prisma.anime.create({ data: { userId: adminId, anilistId: TARGET, catalogEntryId: target.id, titleRomaji: "Alvo Round114" } });

      const link = await request.post("/api/admin/anidb-candidates", { data: { anidbId: AID, action: "confirm", anilistId: TARGET } });
      expect(link.status()).toBe(200);

      // A pessoa que acompanhava só a do AniDB: o mesmo item, agora com AniList ID e na obra da AniList.
      expect(await prisma.anime.findUniqueOrThrow({ where: { id: animeId } })).toMatchObject({ anilistId: TARGET, catalogEntryId: target.id, watchState: "FINISHED", userScore: 8 });
      // O admin: um item só (o da AniList), que herdou favorito, andamento e nota.
      const adminItems = await prisma.anime.findMany({ where: { userId: adminId, catalogEntryId: target.id } });
      expect(adminItems.map((a) => a.id)).toEqual([adminTwin.id]);
      expect(adminItems[0]).toMatchObject({ anilistId: TARGET, isFavorite: true, watchState: "FINISHED", userScore: 6 });
      expect(await prisma.anime.count({ where: { id: adminDb } })).toBe(0);
      // A nota do site da obra da AniList conta as duas notas.
      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { id: target.id } })).siteScoreVotes).toBe(2);
      // O endereço antigo leva à página da AniList.
      const old = await request.get(`/anime/anidb-${AID}`, { maxRedirects: 0 });
      expect(old.status()).toBe(308);
    });
  });
});
