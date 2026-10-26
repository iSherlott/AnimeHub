import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Atualização seletiva também pela Kitsu e pelo AniDB: o lote compara com UMA fonte, o que ela não informa não apaga,
// campo protegido fica, a Kitsu é consultada em grupo e o AniDB uma obra por vez (em segundo plano), parando no primeiro
// sinal de bloqueio — o que não foi consultado fica como falha para reprocessar depois.
const K1 = 115701;
const K_MISSING = 115702;
const A1 = 115901;
const A_BAN = 115902;
const A_AFTER = 115903;
const TAG = "Round115";

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

const anidbXml = (aid: number) =>
  `<?xml version="1.0" encoding="UTF-8"?><anime id="${aid}"><type>Movie</type><episodecount>1</episodecount><startdate>2024-08-02</startdate>` +
  `<titles><title xml:lang="x-jat" type="main">Kaiten ${TAG}</title><title xml:lang="en" type="official">Spin ${TAG}</title><title xml:lang="ja" type="official">回転${TAG}</title></titles>` +
  `<description>http://anidb.net/ch77 [Hero] spins.</description><picture>115901.jpg</picture></anime>`;

test.describe.serial("Atualização seletiva pela Kitsu e pelo AniDB", () => {
  let prisma: PrismaClient;
  let kitsu: Server;
  let anidb: Server;
  const kitsuPaths: string[] = [];
  const anidbHits: number[] = [];
  const id: Record<string, string> = {};

  async function clean() {
    const entries = await prisma.catalogEntry.findMany({ where: { titleRomaji: { contains: TAG } }, select: { id: true } });
    const ids = entries.map((e) => e.id);
    await prisma.changeLog.deleteMany({ where: { catalogEntryId: { in: ids } } });
    const jobs = await prisma.fieldUpdateItem.findMany({ where: { catalogEntryId: { in: ids } }, select: { jobSeq: true }, distinct: ["jobSeq"] });
    await prisma.adminLog.deleteMany({ where: { jobSeq: { in: jobs.map((j) => j.jobSeq) } } });
    await prisma.adminJob.deleteMany({ where: { seq: { in: jobs.map((j) => j.jobSeq) } } });
    await deleteCatalogEntries(prisma, { where: { id: { in: ids } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    kitsu = createServer((req, res) => {
      kitsuPaths.push(decodeURIComponent(req.url ?? ""));
      res.setHeader("Content-Type", "application/vnd.api+json");
      const wanted = new URL(req.url ?? "/", "http://x").searchParams.get("filter[id]")?.split(",").map(Number) ?? [];
      const data = wanted.includes(K1)
        ? [{ id: String(K1), attributes: { canonicalTitle: `Kitsu ${TAG}`, titles: { en: `Kitsu EN ${TAG}`, en_jp: `Kitsu ${TAG}`, ja_jp: `キツ${TAG}` }, synopsis: "Sinopse da Kitsu.", episodeCount: 12, startDate: "2024-01-10", endDate: "2024-03-27", status: "finished", subtype: "TV", posterImage: { original: "https://media.kitsu.app/p115.jpg" }, coverImage: { original: "https://media.kitsu.app/c115.jpg" } } }]
        : [];
      res.end(JSON.stringify({ data }));
    });
    anidb = createServer((req, res) => {
      const aid = Number(new URL(req.url ?? "/", "http://x").searchParams.get("aid"));
      anidbHits.push(aid);
      res.setHeader("Content-Type", "text/xml");
      if (aid === A_BAN) res.end(`<error code="555">Banned</error>`);
      else res.end(anidbXml(aid));
    });
    await new Promise<void>((resolve) => kitsu.listen(3195, resolve));
    await new Promise<void>((resolve) => anidb.listen(3196, resolve));
    await clean();
    const base = { source: "anilist", onPlatform: true, kind: "EPISODE", seasonYear: 2024 };
    // A ordem da coleta é a do título: a obra do bloqueio vem antes da última.
    id.K1 = (await prisma.catalogEntry.create({ data: { ...base, kitsuId: K1, titleRomaji: `Kitsu ${TAG}`, status: "RELEASING", description: "Antiga.", genres: "Drama", format: "TV" } })).id;
    id.KM = (await prisma.catalogEntry.create({ data: { ...base, kitsuId: K_MISSING, titleRomaji: `Kitsu Sumida ${TAG}` } })).id;
    id.NONE = (await prisma.catalogEntry.create({ data: { ...base, titleRomaji: `Sem Ids ${TAG}` } })).id;
    id.A1 = (await prisma.catalogEntry.create({ data: { ...base, source: "anidb", anidbId: A1, titleRomaji: `A AniDB ${TAG}`, titleEnglish: "Nome corrigido", manualFields: ["titleEnglish"] } })).id;
    id.ABAN = (await prisma.catalogEntry.create({ data: { ...base, source: "anidb", anidbId: A_BAN, titleRomaji: `B AniDB ${TAG}` } })).id;
    id.AAFTER = (await prisma.catalogEntry.create({ data: { ...base, source: "anidb", anidbId: A_AFTER, titleRomaji: `C AniDB ${TAG}` } })).id;
  });

  test.afterAll(async () => {
    await clean();
    await new Promise<void>((resolve) => kitsu.close(() => resolve()));
    await new Promise<void>((resolve) => anidb.close(() => resolve()));
    await prisma.$disconnect();
  });

  test("só a equipe do catálogo cria lote; fonte inválida é recusada", async ({ request }) => {
    expect((await request.post("/api/admin/field-updates", { data: { ids: [id.K1], source: "kitsu" } })).status()).toBe(403);
  });

  test.describe("como administrador", () => {
    test.use({ storageState: adminState });

    test("Kitsu: coleta em grupo; não encontrada e sem Kitsu ID ficam marcadas; aplicar muda só o escolhido", async ({ page, request }) => {
      expect((await request.post("/api/admin/field-updates", { data: { ids: [id.K1], source: "mal" } })).status()).toBe(400);
      const res = await request.post("/api/admin/field-updates", { data: { ids: [id.K1, id.KM, id.NONE], source: "kitsu" } });
      expect(res.status()).toBe(201);
      const { seq } = await res.json();
      // Uma consulta só, com as duas obras que têm Kitsu ID.
      expect(kitsuPaths.filter((p) => p.includes("filter[id]"))).toEqual([`/api/edge/anime?filter[id]=${K1},${K_MISSING}&page[limit]=20`]);

      const lot = await (await request.get(`/api/admin/field-updates/${seq}`)).json();
      expect(lot.job.source).toBe("Kitsu");
      const state = Object.fromEntries(lot.items.map((i: { catalogEntryId: string; state: string; message: string | null }) => [i.catalogEntryId, [i.state, i.message]]));
      expect(state[id.K1][0]).toBe("COLLECTED");
      expect(state[id.KM]).toEqual(["NOT_FOUND", "A Kitsu não devolveu esta obra."]);
      expect(state[id.NONE]).toEqual(["SKIPPED", "Sem Kitsu ID: a Kitsu não tem esta obra."]);
      const diff = lot.items.find((i: { catalogEntryId: string }) => i.catalogEntryId === id.K1).diff as Array<{ field: string; changed: boolean; missing: boolean; incoming: string | null }>;
      expect(diff.find((d) => d.field === "status")).toMatchObject({ changed: true, incoming: "FINISHED" });
      // Gêneros: a Kitsu não informa (não apaga "Drama").
      expect(diff.find((d) => d.field === "genres")).toMatchObject({ changed: false, missing: true });

      await page.goto(`/admin/atualizacoes/${seq}`);
      await expect(page.getByTestId(`fu-item-${id.K1}`)).toContainText("Recebido (Kitsu)");

      expect((await request.post(`/api/admin/field-updates/${seq}`, { data: { action: "select", fields: ["status", "episodes"] } })).status()).toBe(200);
      const applied = await request.post(`/api/admin/field-updates/${seq}`, { data: { action: "apply" } });
      expect(applied.status()).toBe(200);
      const after = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: id.K1 } });
      expect(after).toMatchObject({ status: "FINISHED", episodes: 12, description: "Antiga.", genres: "Drama" });
      expect(await prisma.changeLog.count({ where: { catalogEntryId: id.K1, reason: `Atualização seletiva · lote #${seq}` } })).toBe(2);
      expect(await prisma.adminLog.count({ where: { jobSeq: seq, source: "Kitsu" } })).toBe(1);
    });

    test("AniDB pelo botão do catálogo: coleta em segundo plano, para no bloqueio e preserva o campo protegido", async ({ page, request }) => {
      await page.goto(`/admin/obras?q=${encodeURIComponent(`AniDB ${TAG}`)}`);
      const start = page.getByTestId("start-field-update-anidb");
      await expect(start).toContainText("Atualizar campos pelo AniDB (3)");
      await expect(async () => {
        await start.click();
        await expect(page).toHaveURL(/\/admin\/atualizacoes\/\d+$/, { timeout: 3000 });
      }).toPass();
      const seq = Number(page.url().split("/").pop());
      await expect(page.getByTestId("fu-preview")).toBeVisible();
      await expect.poll(async () => (await prisma.adminJob.findUniqueOrThrow({ where: { seq } })).stage, { timeout: 15_000 }).toBe("REVIEW");

      // O bloqueio veio na 2ª obra: a 3ª não foi consultada (insistir só piora).
      expect(anidbHits).toEqual([A1, A_BAN]);
      const items = await prisma.fieldUpdateItem.findMany({ where: { jobSeq: seq } });
      const by = Object.fromEntries(items.map((i) => [i.catalogEntryId, i]));
      expect(by[id.A1].state).toBe("COLLECTED");
      expect(by[id.ABAN]).toMatchObject({ state: "FAILED" });
      expect(by[id.AAFTER].state).toBe("FAILED");
      expect(by[id.AAFTER].message).toContain("recusou as consultas");

      // Títulos: o inglês protegido fica; o japonês e o romaji entram. Sinopse sem a marcação de links do AniDB.
      await page.reload();
      await expect(page.getByTestId(`fu-item-${id.A1}`)).toContainText("Recebido (AniDB)");
      await expect(page.getByTestId(`fu-diff-${id.A1}-titleEnglish`)).toContainText("protegido");
      await expect(page.getByTestId(`fu-diff-${id.A1}-description`)).toContainText("Hero spins.");
      expect((await request.post(`/api/admin/field-updates/${seq}`, { data: { action: "select", fields: ["titleRomaji", "titleEnglish", "titleNative", "coverImage", "format"] } })).status()).toBe(200);
      expect((await request.post(`/api/admin/field-updates/${seq}`, { data: { action: "apply" } })).status()).toBe(200);
      const a1 = await prisma.catalogEntry.findUniqueOrThrow({ where: { id: id.A1 } });
      expect(a1).toMatchObject({ titleRomaji: `Kaiten ${TAG}`, titleEnglish: "Nome corrigido", titleNative: `回転${TAG}`, format: "MOVIE", coverImage: "https://cdn.anidb.net/images/main/115901.jpg" });
      expect(a1.manualFields).toEqual(["titleEnglish"]);
    });
  });
});
