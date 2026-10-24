import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Carga das obras antigas (antes de 2000) pela AniList falsa: busca por temporada + por data de estreia, com o conteúdo adulto na categoria Hentai,
// obra que a AniList guarda só com o ano, e a segunda rodada não duplica nada.
const WITH_SEASON = 998001; // 1985, inverno
const YEAR_ONLY = 998002; // 1985, só o ano
const ADULT = 998003; // 1985, adulta
const NEXT_YEAR = 998004; // 1986, mês conhecido (verão), a AniList não diz a temporada
const IDS = [WITH_SEASON, YEAR_ONLY, ADULT, NEXT_YEAR];

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

const base = { idMal: null, coverImage: { extraLarge: null }, bannerImage: null, episodes: 26, status: "FINISHED", averageScore: null, endDate: null, nextAiringEpisode: null, description: "An old work.", format: "TV", tags: [], externalLinks: [], isAdult: false, relations: { edges: [] } };
const FAKE = [
  { ...base, id: WITH_SEASON, title: { romaji: "Antiga Round98 A", english: null, native: null }, genres: ["Drama"], season: "WINTER", seasonYear: 1985, startDate: { year: 1985, month: 1, day: 10 } },
  { ...base, id: YEAR_ONLY, title: { romaji: "Antiga Round98 B", english: null, native: null }, genres: ["Comedy"], season: null, seasonYear: null, startDate: { year: 1985, month: null, day: null } },
  { ...base, id: ADULT, title: { romaji: "Adulta Round98", english: null, native: null }, genres: ["Hentai"], isAdult: true, season: null, seasonYear: null, startDate: { year: 1985, month: 5, day: 1 } },
  { ...base, id: NEXT_YEAR, title: { romaji: "Antiga Round98 C", english: null, native: null }, genres: ["Action"], season: null, seasonYear: null, startDate: { year: 1986, month: 7, day: 20 } },
];

test.describe.serial("Carga das obras antigas", () => {
  test.use({ storageState: adminState });
  let prisma: PrismaClient;
  let anilist: Server;

  async function clean() {
    const entries = await prisma.catalogEntry.findMany({ where: { anilistId: { in: IDS } }, select: { id: true } });
    await prisma.curationIssue.deleteMany({ where: { entryId: { in: entries.map((e) => e.id) } } });
    await prisma.catalogEntry.deleteMany({ where: { anilistId: { in: IDS } } });
    await prisma.adminJob.deleteMany({ where: { kind: "ANILIST", season: { startsWith: "Obras antigas" } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    anilist = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const { query, variables } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { query: string; variables: Record<string, number | string> };
        res.setHeader("Content-Type", "application/json");
        let media: typeof FAKE = [];
        if (query.includes("startDate_greater")) {
          const after = Number(variables.after);
          const before = Number(variables.before);
          media = FAKE.filter((m) => {
            const { year, month, day } = m.startDate;
            const value = (year ?? 0) * 10000 + (month ?? 0) * 100 + (day ?? 0);
            return value > after && value < before;
          });
        } else if (query.includes("seasonYear: $seasonYear")) {
          media = FAKE.filter((m) => m.season === variables.season && m.seasonYear === variables.seasonYear);
        }
        res.end(JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: false }, media, airingSchedules: [] } } }));
      });
    });
    await new Promise<void>((resolve) => anilist.listen(3197, resolve));
    await clean();
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
    await new Promise<void>((resolve) => anilist.close(() => resolve()));
  });

  test("rejeita anos fora de 1917–1999", async ({ request }) => {
    for (const data of [{ from: 1999, to: 2000 }, { from: 1900, to: 1950 }, { from: 1990, to: 1980 }, { from: "abc" }]) {
      expect((await request.post("/api/admin/anilist/years", { data })).status()).toBe(400);
    }
  });

  test("traz as obras, inclusive a adulta (categoria Hentai), e guarda o ano de quem só tem o ano", async ({ request }) => {
    const response = await request.post("/api/admin/anilist/years", { data: { from: 1985, to: 1986 } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ years: 2, found: 4, brought: 4, alreadyIn: 0, blocked: 0, yearOnly: 1 });

    const entries = await prisma.catalogEntry.findMany({ where: { anilistId: { in: IDS } } });
    const byId = new Map(entries.map((e) => [e.anilistId, e]));
    for (const id of [WITH_SEASON, YEAR_ONLY, ADULT, NEXT_YEAR]) expect(byId.get(id)?.onPlatform).toBe(true);
    expect(byId.get(ADULT)?.genres?.split(",")).toContain("Hentai");
    expect(byId.get(WITH_SEASON)).toMatchObject({ season: "WINTER", seasonYear: 1985 });
    expect(byId.get(YEAR_ONLY)).toMatchObject({ season: null, seasonYear: 1985 });
    expect(byId.get(NEXT_YEAR)).toMatchObject({ season: "SUMMER", seasonYear: 1986 });

    const job = await prisma.adminJob.findFirst({ where: { kind: "ANILIST", season: "Obras antigas 1985–1986" } });
    expect(job?.state).toBe("SUCCESS");
  });

  test("a segunda rodada não duplica nem muda nada", async ({ request }) => {
    const response = await request.post("/api/admin/anilist/years", { data: { from: 1985, to: 1986 } });
    expect(await response.json()).toMatchObject({ found: 4, brought: 0, alreadyIn: 4, blocked: 0 });
    expect(await prisma.catalogEntry.count({ where: { anilistId: { in: IDS } } })).toBe(4);
  });

  test("o painel do Admin pede a carga, mostra o resultado e barra anos inválidos", async ({ page }) => {
    await page.goto("/admin/importacoes");
    const panel = page.getByTestId("old-works-panel");
    await expect(panel).toBeVisible();
    await panel.getByTestId("old-works-from").fill("1985");
    await panel.getByTestId("old-works-to").fill("2001");
    await expect(panel.getByTestId("old-works-start")).toBeDisabled();
    await panel.getByTestId("old-works-to").fill("1985");
    await expect(panel.getByTestId("old-works-start")).toBeEnabled();
    await panel.getByTestId("old-works-start").click();
    await expect(panel.getByTestId("old-works-result")).toContainText("1 ano percorrido: 0 obra(s) trazida(s), 3 já estavam e", { timeout: 60_000 });
  });
});

test.describe("Carga das obras antigas sem ser admin", () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  test("é recusada", async ({ request }) => {
    const response = await request.post("/api/admin/anilist/years", { data: { from: 1985, to: 1985 } });
    expect([401, 403]).toContain(response.status());
  });
});
