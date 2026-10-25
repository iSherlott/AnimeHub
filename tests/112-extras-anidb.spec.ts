import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Especiais, aberturas/encerramentos e trailers do AniDB (S1, C1, T1…) viram extras da obra: seção própria, fora da
// sequência 1, 2, 3, no admin e na página. O admin corrige o extra (com histórico e proteção contra o AniDB), a versão
// otimista recusa a edição de quem abriu antes, e ligar uma obra só do AniDB à AniList leva os extras junto.
const WORK = 112001;
const AID = 112901;
const AID_SOLO = 112902;
const TARGET = 112002;
const TITLE = "Extras Round112";

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

const episodeXml = (epno: string, airdate: string | null, titles: Record<string, string>) =>
  `<episode><epno type="${/^\d+$/.test(epno) ? 1 : 2}">${epno}</epno>${airdate ? `<airdate>${airdate}</airdate>` : ""}${Object.entries(titles)
    .map(([lang, t]) => `<title xml:lang="${lang}">${t}</title>`)
    .join("")}</episode>`;
const animeXml = (aid: number, title: string, episodes: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><anime id="${aid}"><titles><title xml:lang="x-jat" type="main">${title}</title></titles><episodes>${episodes}</episodes></anime>`;

test.describe.serial("Extras do AniDB (especiais, créditos, trailers)", () => {
  let prisma: PrismaClient;
  let anidb: Server;
  let anilist: Server;
  let entryId: string;
  let soloId: string;
  // A segunda consulta ao AniDB traz o título do especial mudado (para ver a proteção do que o admin corrigiu).
  let specialVersion = 1;

  async function clean() {
    const entries = await prisma.catalogEntry.findMany({ where: { OR: [{ anilistId: { in: [WORK, TARGET] } }, { anidbId: { in: [AID, AID_SOLO] } }] }, select: { id: true } });
    const ids = entries.map((e) => e.id);
    await prisma.changeLog.deleteMany({ where: { catalogEntryId: { in: ids } } });
    await prisma.anidbEpisodeCheck.deleteMany({ where: { OR: [{ anidbId: { in: [AID, AID_SOLO] } }, { catalogEntryId: { in: ids } }] } });
    await prisma.airingScheduleEntry.deleteMany({ where: { OR: [{ catalogEntryId: { in: ids } }, { anilistId: { in: [WORK, TARGET] } }] } });
    await prisma.production.deleteMany({ where: { anilistId: { in: [WORK, TARGET] } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: WORK } });
    // Os extras saem junto com a obra (chave estrangeira em cascata).
    await deleteCatalogEntries(prisma, { where: { id: { in: ids } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    anidb = createServer((req, res) => {
      const aid = Number(new URL(req.url ?? "/", "http://x").searchParams.get("aid"));
      res.setHeader("Content-Type", "text/xml");
      if (aid === AID) {
        res.end(
          animeXml(
            aid,
            TITLE,
            episodeXml("1", "2026-01-05", { en: "First" }) +
              episodeXml("2", "2026-01-12", { en: "Second" }) +
              episodeXml("S1", "2026-03-30", { "x-jat": specialVersion === 1 ? "Tokubetsu-hen" : "Tokubetsu-hen Kai", en: specialVersion === 1 ? "The Special" : "The Special v2", ja: "特別編" }) +
              episodeXml("C1", null, { en: "Opening" }) +
              episodeXml("T1", "2025-12-01", { en: "PV 1" })
          )
        );
      } else if (aid === AID_SOLO) {
        res.end(animeXml(aid, "Solo Round112", episodeXml("1", "2026-02-01", { en: "Solo One" }) + episodeXml("S1", null, { en: "Solo Special" }) + episodeXml("T2", "2026-01-20", { en: "Solo PV" })));
      } else res.end(`<error code="500">Internal error</error>`);
    });
    anilist = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => chunks.push(c));
      req.on("end", () => {
        const { variables } = JSON.parse(Buffer.concat(chunks).toString("utf8")) as { variables: Record<string, unknown> };
        const wanted = new Set((variables.ids as number[]) ?? []);
        const media = wanted.has(TARGET)
          ? [{ id: TARGET, idMal: null, title: { romaji: "Alvo Round112", english: null, native: null }, coverImage: { extraLarge: null }, bannerImage: null, description: null, episodes: 1, status: "FINISHED", format: "TV", season: "WINTER", seasonYear: 2026, genres: [], averageScore: null, startDate: null, endDate: null, nextAiringEpisode: null, externalLinks: [] }]
          : [];
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ data: { Page: { pageInfo: { hasNextPage: false }, media, airingSchedules: [] } } }));
      });
    });
    await new Promise<void>((resolve) => anidb.listen(3196, resolve));
    await new Promise<void>((resolve) => anilist.listen(3197, resolve));
    await clean();
    entryId = (await prisma.catalogEntry.create({ data: { anilistId: WORK, anidbId: AID, titleRomaji: TITLE, source: "anilist", onPlatform: true, kind: "EPISODE", format: "TV", episodes: 2, status: "FINISHED", season: "WINTER", seasonYear: 2026 } })).id;
    const franchise = await prisma.franchise.create({ data: { rootAnilistId: WORK, name: TITLE } });
    await prisma.production.create({ data: { anilistId: WORK, catalogEntryId: entryId, franchiseId: franchise.id, titleRomaji: TITLE, seasonNumber: 1, status: "FINISHED", season: "WINTER", seasonYear: 2026, format: "TV", episodes: 2, description: "Sinopse.", genres: "Drama", streamingLinksJson: "[]", fetchedAt: new Date() } });
    soloId = (await prisma.catalogEntry.create({ data: { anidbId: AID_SOLO, titleRomaji: "Solo Round112", source: "anidb", onPlatform: true, kind: "EPISODE", seasonYear: 2099 } })).id;
  });

  test.afterAll(async () => {
    await clean();
    await new Promise<void>((resolve) => anidb.close(() => resolve()));
    await new Promise<void>((resolve) => anilist.close(() => resolve()));
    await prisma.$disconnect();
  });

  test("só a equipe do catálogo edita um extra", async ({ request }) => {
    expect((await request.patch("/api/admin/extras/qualquer", { data: { expectedUpdatedAt: new Date().toISOString(), changes: { title: "x" } } })).status()).toBe(403);
  });

  test.describe("como administrador", () => {
    test.use({ storageState: adminState });

    test("buscar no AniDB grava os extras fora da sequência de episódios", async ({ page }) => {
      await page.goto(`/admin/obras/${entryId}`);
      await page.getByTestId("work-anidb-episodes").click();
      await expect(page.getByTestId("work-anidb-episodes-message")).toContainText("3 extra(s)");

      const extras = await prisma.episodeExtra.findMany({ where: { catalogEntryId: entryId }, orderBy: { code: "asc" } });
      expect(extras.map((e) => [e.code, e.kind])).toEqual([
        ["C1", "CREDIT"],
        ["S1", "SPECIAL"],
        ["T1", "TRAILER"],
      ]);
      expect(extras[1]).toMatchObject({ title: "Tokubetsu-hen", titleEn: "The Special", titleJa: "特別編" });
      expect(extras[1].airDate?.toISOString().slice(0, 10)).toBe("2026-03-30");
      // Sem dia no AniDB, fica sem dia.
      expect(extras[0].airDate).toBeNull();

      await page.reload();
      // Os episódios regulares continuam 2: extras não contam.
      await expect(page.getByTestId("episodes-registered")).toHaveText("2");
      const panel = page.getByTestId("work-detail-extras");
      await expect(panel).toContainText("Extras do AniDB (3)");
      await expect(page.getByTestId("admin-extra-S1")).toContainText("Especiais");
      await expect(page.getByTestId("admin-extra-C1")).toContainText("Aberturas e encerramentos");
      await expect(page.getByTestId("admin-extra-T1")).toContainText("2025-12-01");
    });

    test("corrigir um extra protege o campo, entra no histórico e a busca seguinte não desfaz", async ({ page, request }) => {
      await page.goto(`/admin/obras/${entryId}`);
      await expect(async () => {
        await page.getByTestId("admin-extra-edit-S1").click();
        await expect(page.getByTestId("extra-edit-form")).toBeVisible({ timeout: 2000 });
      }).toPass();
      await page.getByTestId("extra-edit-titleEn").fill("The Special (corrigido)");
      await page.getByTestId("extra-edit-reason").fill("Título do site oficial");
      await page.getByTestId("extra-edit-save").click();
      await expect(page.getByTestId("extra-edit-form")).toHaveCount(0);

      const s1 = await prisma.episodeExtra.findUniqueOrThrow({ where: { catalogEntryId_code: { catalogEntryId: entryId, code: "S1" } } });
      expect(s1.titleEn).toBe("The Special (corrigido)");
      expect(s1.manualFields).toEqual(["titleEn"]);
      const log = await prisma.changeLog.findFirstOrThrow({ where: { entity: "EpisodeExtra", entityId: s1.id, field: "titleEn" } });
      expect(log).toMatchObject({ origin: "ADMIN", reason: "Título do site oficial", catalogEntryId: entryId });
      await page.reload();
      await expect(page.getByTestId("work-detail-history")).toContainText("Extra · Título (inglês)");
      await expect(page.getByTestId("admin-extra-S1")).toContainText("manual");

      // Quem abriu o extra antes da correção não sobrescreve: 409 com os valores atuais.
      const stale = await request.patch(`/api/admin/extras/${s1.id}`, { data: { expectedUpdatedAt: new Date(s1.updatedAt.getTime() - 60_000).toISOString(), changes: { titleEn: "Outro" } } });
      expect(stale.status()).toBe(409);
      expect((await stale.json()).current.titleEn).toBe("The Special (corrigido)");

      // O AniDB mudou os títulos: o romaji acompanha; o inglês corrigido à mão fica.
      specialVersion = 2;
      expect((await request.post(`/api/admin/works/${entryId}/anidb-episodes`)).status()).toBe(200);
      const after = await prisma.episodeExtra.findUniqueOrThrow({ where: { id: s1.id } });
      expect(after).toMatchObject({ title: "Tokubetsu-hen Kai", titleEn: "The Special (corrigido)" });
      expect(await prisma.episodeExtra.count({ where: { catalogEntryId: entryId } })).toBe(3);
    });

    test("ligar a obra só do AniDB à AniList leva os extras: o que o destino já tem fica e só se completa", async ({ request }) => {
      expect((await request.post(`/api/admin/works/${soloId}/anidb-episodes`)).status()).toBe(200);
      expect(await prisma.episodeExtra.count({ where: { catalogEntryId: soloId } })).toBe(2);

      const target = await prisma.catalogEntry.create({ data: { anilistId: TARGET, titleRomaji: "Alvo Round112", source: "anilist", onPlatform: false, format: "TV" } });
      await prisma.episodeExtra.create({ data: { catalogEntryId: target.id, code: "S1", kind: "SPECIAL", number: 1, title: "Alvo Especial" } });

      const res = await request.post("/api/admin/anidb-candidates", { data: { anidbId: AID_SOLO, action: "confirm", anilistId: TARGET } });
      expect(res.status()).toBe(200);

      const moved = await prisma.episodeExtra.findMany({ where: { catalogEntryId: target.id }, orderBy: { code: "asc" } });
      expect(moved.map((e) => [e.code, e.title, e.titleEn])).toEqual([
        ["S1", "Alvo Especial", "Solo Special"],
        ["T2", null, "Solo PV"],
      ]);
      expect(await prisma.catalogEntry.count({ where: { id: soloId } })).toBe(0);
    });
  });

  test("a página da obra mostra os extras numa seção própria, minimizada, separada dos episódios", async ({ page }) => {
    await page.goto(`/anime/${WORK}`);
    const section = page.getByTestId("work-extras");
    await expect(section).toContainText("Especiais: 1");
    await expect(page.getByTestId("work-extra-S1")).toHaveCount(0);
    await expect(async () => {
      await page.getByTestId("work-extras-toggle").click();
      await expect(page.getByTestId("work-extra-S1")).toBeVisible({ timeout: 2000 });
    }).toPass();
    // Padrão do produto: japonês → o título em japonês do AniDB.
    await expect(page.getByTestId("work-extra-S1")).toContainText("特別編");
    await expect(page.getByTestId("work-extra-S1")).toContainText(/30 de mar\.? de 2026/);
    await expect(page.getByTestId("work-extras-CREDIT")).toContainText("Aberturas e encerramentos");
    await expect(page.getByTestId("work-extras-TRAILER")).toContainText("PV 1");
  });
});
