import { createServer, type Server } from "node:http";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_SESSION_TOKEN } from "./test-auth";

// Admin → Match name → "Obras sem página": o admin confirma, recusa ou escolhe pela busca a obra da AniList de uma obra que só
// existe pelo AniDB. A AniList é falsa (mesma porta que o servidor de teste usa).
const SUGGESTED = 29911; // tem sugestão certa: vira a obra da AniList
const REJECTED = 29913; // a sugestão está errada: o admin recusa
const SEARCHED = 29912; // sem sugestão: o admin acha pela busca
const ANILIST_SUGGESTED = 991001;
const ANILIST_WRONG = 991003;
const ANILIST_FOUND = 991002;
const COVER = "https://s4.anilist.co/file/anilistcdn/media/anime/cover-91.jpg";

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

const media = (id: number, romaji: string) => ({
  id,
  idMal: null,
  title: { romaji, english: null, native: null },
  coverImage: { extraLarge: COVER },
  bannerImage: null,
  description: `Sinopse da AniList para ${romaji}.`,
  episodes: 1,
  status: "FINISHED",
  season: "SUMMER",
  seasonYear: 2023,
  genres: ["Comedy"],
  averageScore: 70,
  startDate: { year: 2023, month: 7, day: 30 },
  endDate: { year: 2023, month: 7, day: 30 },
  nextAiringEpisode: null,
  externalLinks: [],
});
const NO_SEASON_ANIDB = 29915; // ONA: a AniList não tem temporada, o AniDB tem
const ANILIST_NO_SEASON = 991004;
const WORKS = [
  media(ANILIST_SUGGESTED, "Hoshijyo Round91 Pirates"),
  media(ANILIST_FOUND, "Par Encontrado Round91"),
  media(ANILIST_WRONG, "Obra Errada Round91"),
  { ...media(ANILIST_NO_SEASON, "Ona Sem Temporada Round91"), format: "ONA", season: null, seasonYear: null, startDate: { year: 2024, month: 4, day: 5 } },
];

test.describe.serial("Match name — obras sem página", () => {
  test.use({ storageState: adminState });
  let prisma: PrismaClient;
  let anilist: Server;

  async function clean() {
    await prisma.anidbCandidate.deleteMany({ where: { anidbId: { in: [SUGGESTED, REJECTED, SEARCHED] } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: [ANILIST_SUGGESTED, ANILIST_FOUND, ANILIST_WRONG] } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: [ANILIST_SUGGESTED, ANILIST_FOUND, ANILIST_WRONG] } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [ANILIST_SUGGESTED, ANILIST_FOUND, ANILIST_WRONG] } } });
    await deleteCatalogEntries(prisma, { where: { OR: [{ anilistId: { in: [ANILIST_SUGGESTED, ANILIST_FOUND, ANILIST_WRONG] } }, { anidbId: { in: [SUGGESTED, REJECTED, SEARCHED] } }] } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    anilist = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const { query, variables } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { query: string; variables: Record<string, unknown> };
        res.setHeader("Content-Type", "application/json");
        if (query.includes("airingSchedules")) {
          res.end(JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: false }, airingSchedules: [] } } }));
        } else if (query.includes("id_in")) {
          const wanted = new Set((variables.ids as number[]) ?? []);
          res.end(JSON.stringify({ data: { Page: { media: WORKS.filter((m) => wanted.has(m.id)) } } }));
        } else if (typeof variables.search === "string") {
          const needle = variables.search.toLowerCase();
          res.end(JSON.stringify({ data: { Page: { media: WORKS.filter((m) => m.title.romaji.toLowerCase().includes(needle.split(" ")[0])) } } }));
        } else {
          res.end(JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: false }, media: [] } } }));
        }
      });
    });
    await new Promise<void>((resolve) => anilist.listen(3197, resolve));
    await clean();
    const base = { source: "anidb", onPlatform: true, season: "SUMMER", seasonYear: 2023, status: "FINISHED", genres: "Comedy", coverImage: COVER } as const;
    await prisma.catalogEntry.create({ data: { ...base, anidbId: SUGGESTED, titleRomaji: "Hoshijo Round91 Pirates" } });
    await prisma.catalogEntry.create({ data: { ...base, anidbId: REJECTED, titleRomaji: "Outra Obra Round91" } });
    await prisma.catalogEntry.create({ data: { ...base, anidbId: SEARCHED, titleRomaji: "Sem Par Round91" } });
    await prisma.anidbCandidate.create({ data: { anidbId: SUGGESTED, anilistId: ANILIST_SUGGESTED, candidateTitle: "Hoshijyo Round91 Pirates", score: 0.9, reason: "semelhança de 90%" } });
    await prisma.anidbCandidate.create({ data: { anidbId: REJECTED, anilistId: ANILIST_WRONG, candidateTitle: "Obra Errada Round91", score: 0.6, reason: "semelhança de 60%" } });
  });

  test.afterAll(async () => {
    await clean();
    await new Promise<void>((resolve) => anilist.close(() => resolve()));
    await prisma.$disconnect();
  });

  test("só o admin vê e decide", async ({ playwright, baseURL }) => {
    const guest = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await guest.get("/api/admin/anidb-candidates")).status()).toBe(401);
    expect((await guest.post("/api/admin/anidb-candidates", { data: { anidbId: SUGGESTED, action: "reject" } })).status()).toBe(401);
    await guest.dispose();
    const member = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_TOKEN}` } });
    expect((await member.get("/api/admin/anidb-candidates/search?q=hoshi")).status()).toBe(403);
    await member.dispose();
  });

  test("valida as decisões", async ({ request }) => {
    for (const bad of [{}, { anidbId: "x", action: "confirm" }, { anidbId: SUGGESTED, action: "apagar" }, { anidbId: SUGGESTED, action: "confirm", anilistId: -2 }]) {
      expect((await request.post("/api/admin/anidb-candidates", { data: bad })).status()).toBe(400);
    }
    expect((await request.post("/api/admin/anidb-candidates", { data: { anidbId: 999999, action: "confirm" } })).status()).toBe(422); // sem sugestão nem obra escolhida
  });

  test("a tela lista as sugestões e as obras sem sugestão", async ({ page }) => {
    await page.goto("/admin/match-name");
    const panel = page.getByTestId("anidb-only");
    await expect(panel.getByTestId(`anidb-row-${SUGGESTED}`)).toContainText("Hoshijo Round91 Pirates");
    await expect(panel.getByTestId(`anidb-row-${SUGGESTED}`)).toContainText("Hoshijyo Round91 Pirates");
    await expect(panel.getByTestId(`anidb-row-${SUGGESTED}`)).toContainText("90%");
    await expect(panel.getByTestId(`anidb-row-${REJECTED}`)).toBeVisible();
    await panel.getByTestId("tab-none").click();
    await expect(panel.getByTestId(`anidb-row-${SEARCHED}`)).toContainText("Sem Par Round91");
    await expect(panel.getByTestId(`anidb-confirm-${SEARCHED}`)).toHaveCount(0); // sem sugestão não há "É a mesma obra"
  });

  test("é a mesma obra: liga, a obra ganha página e entra com o nome do AniDB", async ({ page }) => {
    await page.goto("/admin/match-name");
    const panel = page.getByTestId("anidb-only");
    await panel.getByTestId(`anidb-confirm-${SUGGESTED}`).click();
    await expect(panel.getByTestId("anidb-done")).toContainText("tem página");
    await expect(panel.getByTestId(`anidb-row-${SUGGESTED}`)).toHaveCount(0);

    const linked = await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: ANILIST_SUGGESTED } });
    expect(linked).toMatchObject({ anidbId: SUGGESTED, onPlatform: true, titleRomaji: "Hoshijo Round91 Pirates", titleLocked: true });
    expect(await prisma.catalogEntry.count({ where: { anidbId: SUGGESTED, anilistId: null } })).toBe(0);
    expect(await prisma.anidbCandidate.count({ where: { anidbId: SUGGESTED } })).toBe(0);
    const opened = await page.goto(`/anime/${ANILIST_SUGGESTED}`);
    expect(opened?.status()).toBe(200);
  });

  test("não é: a sugestão não volta e a obra passa para 'sem sugestão'", async ({ page }) => {
    await page.goto("/admin/match-name");
    const panel = page.getByTestId("anidb-only");
    await panel.getByTestId(`anidb-reject-${REJECTED}`).click();
    await expect(panel.getByTestId("anidb-done")).toContainText("Sugestão recusada");
    await expect(panel.getByTestId(`anidb-row-${REJECTED}`)).toHaveCount(0);
    expect((await prisma.anidbCandidate.findUniqueOrThrow({ where: { anidbId: REJECTED } })).status).toBe("REJECTED");
    await panel.getByTestId("tab-none").click();
    await expect(panel.getByTestId(`anidb-row-${REJECTED}`)).toBeVisible();
    // A obra errada da AniList nunca foi ligada.
    expect(await prisma.catalogEntry.count({ where: { anilistId: ANILIST_WRONG, anidbId: { not: null } } })).toBe(0);
  });

  test("sem sugestão: busca na AniList, escolhe a obra certa e liga", async ({ page }) => {
    await page.goto("/admin/match-name");
    const panel = page.getByTestId("anidb-only");
    await panel.getByTestId("tab-none").click();
    await panel.getByTestId(`anidb-search-${SEARCHED}`).click();
    const box = panel.getByTestId(`anidb-search-box-${SEARCHED}`);
    await box.getByRole("textbox").fill("Par Encontrado");
    await box.getByTestId(`anidb-search-go-${SEARCHED}`).click();
    await box.getByTestId(`anidb-hit-${ANILIST_FOUND}`).click();
    await expect(panel.getByTestId("anidb-done")).toContainText("tem página");
    expect(await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: ANILIST_FOUND } })).toMatchObject({ anidbId: SEARCHED, onPlatform: true });
    expect(await prisma.catalogEntry.count({ where: { anidbId: SEARCHED, anilistId: null } })).toBe(0);
  });

  test("obra sem temporada na AniList (ONA) fica na temporada do AniDB", async ({ request }) => {
    await prisma.catalogEntry.create({ data: { source: "anidb", onPlatform: true, anidbId: NO_SEASON_ANIDB, titleRomaji: "Ona Sem Temporada Round91", season: "SPRING", seasonYear: 2024, format: "ONA" } });
    try {
      const res = await request.post("/api/admin/anidb-candidates", { data: { anidbId: NO_SEASON_ANIDB, action: "confirm", anilistId: ANILIST_NO_SEASON } });
      expect(res.status()).toBe(200);
      expect(await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: ANILIST_NO_SEASON } })).toMatchObject({ anidbId: NO_SEASON_ANIDB, season: "SPRING", seasonYear: 2024 });
      // A própria ligação já refez o cache a partir da AniList (sem temporada): a do AniDB continua.
    } finally {
      await deleteCatalogEntries(prisma, { where: { OR: [{ anidbId: NO_SEASON_ANIDB }, { anilistId: ANILIST_NO_SEASON }] } });
      await prisma.production.deleteMany({ where: { anilistId: ANILIST_NO_SEASON } });
    }
  });

  test("a mesma obra da AniList não liga a duas obras do AniDB", async ({ request }) => {
    await prisma.catalogEntry.create({ data: { source: "anidb", onPlatform: true, anidbId: 29914, titleRomaji: "Outra Que Quer A Mesma Round91", season: "SUMMER", seasonYear: 2023 } });
    try {
      const res = await request.post("/api/admin/anidb-candidates", { data: { anidbId: 29914, action: "confirm", anilistId: ANILIST_FOUND } });
      expect(res.status()).toBe(409);
    } finally {
      await deleteCatalogEntries(prisma, { where: { anidbId: 29914 } });
    }
  });
});
