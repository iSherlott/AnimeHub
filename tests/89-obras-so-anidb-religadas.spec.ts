import { test, expect } from "@playwright/test";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_SESSION_TOKEN } from "./test-auth";

// Obra que só existe pelo AniDB não tem página nem horário. Quando o catálogo da AniList já tem a mesma obra (título escrito
// de outro jeito: "Dai Ni Maku" × "2nd Season"), o admin religa as duas: sobra a obra da AniList, com página.
const ANILIST = 989001;
const ANIDB = 29891;
const ALONE_ANIDB = 29892; // sem candidato: continua só do AniDB
const SPELL_ANILIST = 989003; // a AniList escreve "Shoujyo", o AniDB "Shoujo": é o mesmo título
const SPELL_ANIDB = 29893;
const GENRE = "Round89Genero";
const COVER = "https://s4.anilist.co/file/anilistcdn/media/anime/cover-89.jpg";

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Obras só do AniDB religadas à AniList", () => {
  let prisma: PrismaClient;

  async function clean() {
    await prisma.production.deleteMany({ where: { anilistId: { in: [ANILIST, SPELL_ANILIST] } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: [ANILIST, SPELL_ANILIST] } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [ANILIST, SPELL_ANILIST] } } });
    await deleteCatalogEntries(prisma, { where: { OR: [{ anilistId: { in: [ANILIST, SPELL_ANILIST] } }, { anidbId: { in: [ANIDB, ALONE_ANIDB, SPELL_ANIDB] } }] } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    // O que a AniList tem (cache, fora da plataforma) e o que só veio pelo AniDB, com o título escrito de outro jeito.
    await prisma.catalogEntry.create({
      data: { anilistId: ANILIST, titleRomaji: "Relink Round89 2nd Season", titleEnglish: "Relink Round89 Season 2", season: "WINTER", seasonYear: 2024, startDate: new Date("2024-01-08T00:00:00Z"), status: "FINISHED", genres: GENRE, source: "anilist", onPlatform: false },
    });
    await prisma.catalogEntry.create({
      data: { anidbId: ANIDB, titleRomaji: "Relink Round89 Dai Ni Maku", season: "WINTER", seasonYear: 2024, startDate: new Date("2024-01-08T00:00:00Z"), status: "FINISHED", genres: GENRE, coverImage: COVER, description: "Sinopse do AniDB.", source: "anidb", onPlatform: true },
    });
    await prisma.catalogEntry.create({
      data: { anilistId: SPELL_ANILIST, titleRomaji: "Shoujyo Round89 Pirates", titleEnglish: null, season: "WINTER", seasonYear: 2024, startDate: new Date("2024-01-20T00:00:00Z"), status: "FINISHED", genres: GENRE, source: "anilist", onPlatform: false },
    });
    await prisma.catalogEntry.create({
      data: { anidbId: SPELL_ANIDB, titleRomaji: "Shoujo Round89 Pirates", season: "WINTER", seasonYear: 2024, startDate: new Date("2024-01-20T00:00:00Z"), status: "FINISHED", genres: GENRE, source: "anidb", onPlatform: true },
    });
    await prisma.catalogEntry.create({ data: { anidbId: ALONE_ANIDB, titleRomaji: "Zzz Obra Sem Par Na Aniliste Round89", season: "WINTER", seasonYear: 2024, status: "FINISHED", genres: GENRE, source: "anidb", onPlatform: true } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("só o admin pode religar", async ({ playwright, baseURL }) => {
    const guest = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await guest.post("/api/admin/catalog/relink?dryRun=true")).status()).toBe(401);
    await guest.dispose();
    const member = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_TOKEN}` } });
    expect((await member.post("/api/admin/catalog/relink?dryRun=true")).status()).toBe(403);
    await member.dispose();
  });

  test.describe("pelo admin", () => {
    test.use({ storageState: adminState });

    test("o ensaio mostra o que seria ligado sem gravar nada", async ({ request }) => {
      const res = await request.post("/api/admin/catalog/relink?dryRun=true");
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.dryRun).toBe(true);
      const item = body.linked.find((l: { anidbId: number }) => l.anidbId === ANIDB);
      expect(item).toMatchObject({ anilistId: ANILIST, via: "local" });
      expect(item.score).toBeGreaterThanOrEqual(0.92);
      expect(body.linked.some((l: { anidbId: number }) => l.anidbId === ALONE_ANIDB)).toBe(false);
      // Nada mudou.
      expect(await prisma.catalogEntry.count({ where: { anidbId: ANIDB, anilistId: null } })).toBe(1);
      expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: ANILIST } })).onPlatform).toBe(false);
    });

    test("religar: a obra da AniList assume o AniDB, entra na plataforma e a cópia só do AniDB some", async ({ request }) => {
      const res = await request.post("/api/admin/catalog/relink");
      expect(res.status()).toBe(200);
      expect((await res.json()).linked.map((l: { anidbId: number }) => l.anidbId)).toContain(ANIDB);

      const anilist = await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: ANILIST } });
      expect(anilist.anidbId).toBe(ANIDB);
      expect(anilist.onPlatform).toBe(true);
      expect(anilist.coverImage).toBe(COVER); // o que faltava na AniList veio do AniDB
      expect(anilist.description).toBe("Sinopse do AniDB.");
      expect(await prisma.catalogEntry.count({ where: { anidbId: ANIDB, anilistId: null } })).toBe(0);
      // Mesmo título com outra grafia: vale o nome do AniDB, a AniList fica como título alternativo e o nome não é sobrescrito.
      const spelled = await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: SPELL_ANILIST } });
      expect(spelled).toMatchObject({ titleRomaji: "Shoujo Round89 Pirates", titleEnglish: "Shoujyo Round89 Pirates", titleLocked: true, anidbId: SPELL_ANIDB, onPlatform: true });
      // "2nd Season" × "Dai Ni Maku" é outro nome de verdade: o título da AniList continua.
      expect(anilist).toMatchObject({ titleRomaji: "Relink Round89 2nd Season", titleLocked: false });
      // A que não tem par continua como estava.
      expect(await prisma.catalogEntry.count({ where: { anidbId: ALONE_ANIDB, anilistId: null } })).toBe(1);
      expect(await prisma.adminLog.count({ where: { event: "Relink" } })).toBeGreaterThan(0);
    });

    test("religar de novo é seguro", async ({ request }) => {
      const res = await request.post("/api/admin/catalog/relink");
      expect((await res.json()).linked.some((l: { anidbId: number }) => l.anidbId === ANIDB)).toBe(false);
      expect(await prisma.catalogEntry.count({ where: { anilistId: ANILIST } })).toBe(1);
    });

    test("a obra passa a ter página e o cartão de obra finalizada diz 'Finalizado', não 'Data não definida'", async ({ page, request }) => {
      const catalog = await (await request.get("/api/catalog")).json();
      const keys = catalog.results.map((r: { key: string }) => r.key);
      expect(keys).toContain(`anilist-${ANILIST}`);
      expect(keys).not.toContain(`anidb-${ANIDB}`);

      await page.goto("/discover");
      await page.getByLabel("Gênero").selectOption(GENRE);
      const card = page.getByTestId(`explore-card-anilist-${ANILIST}`);
      await expect(card).toContainText("Finalizado · 2024");
      await expect(card).not.toContainText("Data não definida");
      await expect(card.getByRole("link", { name: "Relink Round89 2nd Season" }).first()).toHaveAttribute("href", `/anime/${ANILIST}`);
      // O nome do AniDB acha, e a grafia da AniList também (a busca entende "Shoujyo" × "Shoujo").
      await page.getByLabel("Gênero").selectOption("");
      for (const typed of ["Shoujo Round89", "Shoujyo Round89"]) {
        await page.getByPlaceholder("Buscar anime...").fill(typed);
        await expect(page.getByRole("link", { name: "Shoujo Round89 Pirates" }).first()).toBeVisible();
      }
      await page.getByPlaceholder("Buscar anime...").fill("");
      await page.getByLabel("Gênero").selectOption(GENRE);
      const lonely = page.getByTestId(`explore-card-anidb-${ALONE_ANIDB}`);
      await expect(lonely).toContainText("Finalizado"); // ainda não dá para acompanhar, mas também sem "Data não definida"
      await expect(lonely).not.toContainText("Data não definida");
      // Sem AniList ID também se acompanha, pela chave do catálogo (spec 114).
      await expect(lonely.getByRole("button", { name: "+ Acompanhar" })).toBeEnabled();

      const open = await page.goto(`/anime/${ANILIST}`);
      expect(open?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    });
  });
});
