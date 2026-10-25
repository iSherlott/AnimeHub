import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Obras sem AniList ID (só do AniDB) passam a ter episódios: vêm do AniDB com título e dia (sem horário), a identidade é
// (obra do catálogo, número), especiais ficam de fora, o lote respeita o intervalo de 30 dias por obra e registra as
// falhas, e ao ligar a obra à AniList os episódios se juntam aos da AniList sem colidir no número.
const AID_A = 111901;
const AID_B = 111902;
const AID_FAIL = 111903;
const TARGET = 111001; // obra da AniList para onde a A é ligada

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

const episodeXml = (epno: string, airdate: string | null, en: string | null) =>
  `<episode><epno type="${/^\d+$/.test(epno) ? 1 : 2}">${epno}</epno>${airdate ? `<airdate>${airdate}</airdate>` : ""}${en ? `<title xml:lang="en">${en}</title>` : ""}</episode>`;
const animeXml = (aid: number, title: string, episodes: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><anime id="${aid}"><titles><title xml:lang="x-jat" type="main">${title}</title></titles><episodes>${episodes}</episodes></anime>`;

test.describe.serial("Episódios das obras só do AniDB", () => {
  let prisma: PrismaClient;
  let anidb: Server;
  let anilist: Server;
  const hits: Record<string, number> = {};
  const id: Record<string, string> = {};

  async function clean() {
    const entries = await prisma.catalogEntry.findMany({ where: { OR: [{ anidbId: { in: [AID_A, AID_B, AID_FAIL] } }, { anilistId: TARGET }] }, select: { id: true } });
    await prisma.anidbEpisodeCheck.deleteMany({ where: { OR: [{ anidbId: { in: [AID_A, AID_B, AID_FAIL] } }, { catalogEntryId: { in: entries.map((e) => e.id) } }] } });
    await prisma.airingScheduleEntry.deleteMany({ where: { OR: [{ catalogEntryId: { in: entries.map((e) => e.id) } }, { anilistId: TARGET }] } });
    const jobs = await prisma.adminJob.findMany({ where: { kind: "ANIDB_EPISODES" }, select: { seq: true } });
    await prisma.adminLog.deleteMany({ where: { jobSeq: { in: jobs.map((j) => j.seq) } } });
    await prisma.adminJob.deleteMany({ where: { kind: "ANIDB_EPISODES" } });
    await prisma.production.deleteMany({ where: { anilistId: TARGET } });
    await deleteCatalogEntries(prisma, { where: { OR: [{ anidbId: { in: [AID_A, AID_B, AID_FAIL] } }, { anilistId: TARGET }] } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    anidb = createServer((req, res) => {
      const aid = Number(new URL(req.url ?? "/", "http://x").searchParams.get("aid"));
      hits[aid] = (hits[aid] ?? 0) + 1;
      res.setHeader("Content-Type", "text/xml");
      if (aid === AID_A) res.end(animeXml(aid, "So AniDB A Round111", episodeXml("1", "2020-01-05", "First") + episodeXml("2", "2020-01-12", "Second") + episodeXml("S1", null, "Special")));
      else if (aid === AID_B) res.end(animeXml(aid, "So AniDB B Round111", episodeXml("1", "2021-04-02", "Beginning")));
      else res.end(`<error code="500">Internal error</error>`);
    });
    anilist = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const { variables } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { variables: Record<string, unknown> };
        const wanted = new Set((variables.ids as number[]) ?? []);
        const media = wanted.has(TARGET)
          ? [{ id: TARGET, idMal: null, title: { romaji: "Alvo Round111", english: null, native: null }, coverImage: { extraLarge: null }, bannerImage: null, description: null, episodes: 2, status: "FINISHED", format: "TV", season: "WINTER", seasonYear: 2020, genres: [], averageScore: null, startDate: null, endDate: null, nextAiringEpisode: null, externalLinks: [] }]
          : [];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: false }, media, airingSchedules: [] } } }));
      });
    });
    await new Promise<void>((resolve) => anidb.listen(3196, resolve));
    await new Promise<void>((resolve) => anilist.listen(3197, resolve));
    await clean();
    const base = { source: "anidb", onPlatform: true, kind: "EPISODE", seasonYear: 2099 };
    id.A = (await prisma.catalogEntry.create({ data: { ...base, anidbId: AID_A, titleRomaji: "So AniDB A Round111", episodes: 2 } })).id;
    id.B = (await prisma.catalogEntry.create({ data: { ...base, anidbId: AID_B, titleRomaji: "So AniDB B Round111" } })).id;
    id.FAIL = (await prisma.catalogEntry.create({ data: { ...base, anidbId: AID_FAIL, titleRomaji: "So AniDB Falha Round111" } })).id;
  });

  test.afterAll(async () => {
    await clean();
    await new Promise<void>((resolve) => anidb.close(() => resolve()));
    await new Promise<void>((resolve) => anilist.close(() => resolve()));
    await prisma.$disconnect();
  });

  test("só a equipe do catálogo busca no AniDB", async ({ request }) => {
    expect((await request.post("/api/admin/anidb-episodes", { data: {} })).status()).toBe(403);
    expect((await request.post(`/api/admin/works/${id.A}/anidb-episodes`)).status()).toBe(403);
  });

  test.describe("como administrador", () => {
    test.use({ storageState: adminState });

    test("busca de uma obra: episódios regulares com título e só o dia, sem AniList ID; especiais de fora", async ({ page }) => {
      await page.goto(`/admin/obras/${id.A}`);
      await page.getByTestId("work-anidb-episodes").click();
      await expect(page.getByTestId("work-anidb-episodes-message")).toContainText("2 episódio(s) no AniDB");

      const rows = await prisma.airingScheduleEntry.findMany({ where: { catalogEntryId: id.A }, orderBy: { episode: "asc" } });
      expect(rows.map((r) => r.episode)).toEqual([1, 2]);
      expect(rows[0]).toMatchObject({ anilistId: null, airingAt: null, dateCertainty: "DATE_ONLY", source: "anidb", episodeTitleEn: "First" });
      expect(rows[0].airDate?.toISOString().slice(0, 10)).toBe("2020-01-05");

      await page.reload();
      await expect(page.getByTestId("episodes-registered")).toHaveText("2");
      await expect(page.getByTestId("episodes-aired")).toHaveText("2");
      await page.goto(`/admin/episodios?obra=${id.A}`);
      await expect(page.getByTestId("admin-episodes-table")).toContainText("(só o dia)");
      await expect(page.getByTestId("admin-episodes-table")).toContainText("First");
    });

    test("o lote consulta as que faltam, registra a falha e não consulta de novo dentro de 30 dias", async ({ page, request }) => {
      await page.goto("/admin/episodios");
      await expect(page.getByTestId("anidb-episodes-panel")).toBeVisible();
      const res = await request.post("/api/admin/anidb-episodes", { data: { limit: 3 } });
      expect(res.status()).toBe(202);
      const { seq } = await res.json();
      await expect.poll(async () => (await prisma.adminJob.findUniqueOrThrow({ where: { seq } })).state, { timeout: 30_000 }).toBe("SUCCESS");
      const result = JSON.parse((await prisma.adminJob.findUniqueOrThrow({ where: { seq } })).resultJson ?? "{}");
      expect(result).toMatchObject({ withEpisodes: 1, failed: 1 });
      expect(await prisma.airingScheduleEntry.count({ where: { catalogEntryId: id.B } })).toBe(1);
      expect((await prisma.anidbEpisodeCheck.findUniqueOrThrow({ where: { catalogEntryId: id.FAIL } })).error).toContain("Internal error");
      expect(hits[AID_A]).toBe(1); // a A já tinha sido consultada: o lote não repete

      const again = await request.post("/api/admin/anidb-episodes", { data: { limit: 3 } });
      const seq2 = (await again.json()).seq;
      await expect.poll(async () => (await prisma.adminJob.findUniqueOrThrow({ where: { seq: seq2 } })).state, { timeout: 30_000 }).toBe("SUCCESS");
      expect(hits[AID_B]).toBe(1); // dentro de 30 dias, a B não é consultada de novo
      expect(hits[AID_FAIL]).toBe(2); // a que deu erro tenta de novo
    });

    test("editar a data de um episódio só do AniDB grava no próprio episódio (sem override)", async ({ request }) => {
      const row = await prisma.airingScheduleEntry.findFirstOrThrow({ where: { catalogEntryId: id.A, episode: 2 } });
      const res = await request.patch(`/api/admin/episodes/${row.id}`, { data: { expectedUpdatedAt: row.updatedAt.toISOString(), changes: { airDate: "2020-01-13" }, reason: "Data do site oficial" } });
      expect(res.status()).toBe(200);
      expect((await res.json()).override).toBe(false);
      const after = await prisma.airingScheduleEntry.findUniqueOrThrow({ where: { id: row.id } });
      expect(after.airDate?.toISOString().slice(0, 10)).toBe("2020-01-13");
      expect(after.manualFields).toContain("airDate");
    });

    test("ligar a obra à AniList junta os episódios: o da AniList fica e ganha o título; o resto passa a ter AniList ID", async ({ request }) => {
      await prisma.catalogEntry.create({ data: { anilistId: TARGET, titleRomaji: "Alvo Round111", source: "anilist", onPlatform: false, format: "TV" } });
      const target = await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: TARGET } });
      await prisma.airingScheduleEntry.create({ data: { anilistId: TARGET, catalogEntryId: target.id, episode: 1, airingAt: new Date("2020-01-05T15:00:00Z"), titleRomaji: "Alvo Round111" } });

      // Admin → Match name → obras sem página: ligar à obra escolhida da AniList.
      const res = await request.post("/api/admin/anidb-candidates", { data: { anidbId: AID_A, action: "confirm", anilistId: TARGET } });
      expect(res.status()).toBe(200);

      const rows = await prisma.airingScheduleEntry.findMany({ where: { catalogEntryId: target.id }, orderBy: { episode: "asc" } });
      expect(rows.map((r) => [r.episode, r.anilistId])).toEqual([
        [1, TARGET],
        [2, TARGET],
      ]);
      // O da AniList (com horário) ficou e recebeu o título que o AniDB tinha.
      expect(rows[0].airingAt?.toISOString()).toBe("2020-01-05T15:00:00.000Z");
      expect(rows[0].episodeTitleEn).toBe("First");
      expect(await prisma.catalogEntry.count({ where: { id: id.A } })).toBe(0);
    });
  });
});
