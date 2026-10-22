import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Epic 44: a sinopse aparece em português. A tradução em lote guarda o texto na obra (inclusive nas só do AniDB), para quando a
// cota do serviço gratuito acaba (ela parava tudo e a tela caía no inglês); a página já nasce com o texto traduzido e, se a
// tradução não puder ser feita, mostra o original com um aviso. O MyMemory é simulado por um servidor local (MYMEMORY_URL).
const BATCH = [997001, 997002, 997003]; // ranks -300.. : vêm primeiro na fila
const QUOTA = [997011, 997012, 997013];
const ANIDB_ID = 997100;
const STORED = 997201; // já tem a tradução guardada
const BROKEN = 997202; // o serviço de tradução está fora
const ALL = [...BATCH, ...QUOTA, STORED, BROKEN];

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Sinopse em português", () => {
  test.use({ storageState: adminState });
  let prisma: PrismaClient;
  let fake: Server;
  let mode: "ok" | "quota" | "down" = "ok";

  async function clean() {
    await prisma.synopsisTranslation.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: ALL } } });
    await prisma.catalogEntry.deleteMany({ where: { OR: [{ anilistId: { in: ALL } }, { anidbId: ANIDB_ID }] } });
    await prisma.adminJob.deleteMany({ where: { kind: "TRANSLATION", adminName: { not: null } } });
  }

  /** Desfaz as traduções da fila de cota (na obra e no cache antigo) para o teste seguinte partir do zero. */
  async function resetQuota() {
    await prisma.catalogEntry.updateMany({ where: { anilistId: { in: QUOTA } }, data: { descriptionPt: null } });
    await prisma.synopsisTranslation.deleteMany({ where: { anilistId: { in: QUOTA } } });
  }

  async function run(request: import("@playwright/test").APIRequestContext, limit: number) {
    const before = (await (await request.get("/api/admin/translation")).json()).job?.seq ?? 0;
    const started = await request.post("/api/admin/translation", { data: { lang: "pt", limit } });
    expect(started.status()).toBe(202);
    await expect
      .poll(async () => {
        const status = await (await request.get("/api/admin/translation")).json();
        return status.job && status.job.seq > before ? status.job.state : "WAITING";
      }, { timeout: 60_000 })
      .toBe("SUCCESS");
    return (await (await request.get("/api/admin/translation")).json()).progress;
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    fake = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      res.setHeader("Content-Type", "application/json");
      if (!url.pathname.startsWith("/mymemory")) {
        res.statusCode = 404;
        return res.end("{}");
      }
      if (mode === "down") {
        res.statusCode = 500;
        return res.end("{}");
      }
      if (mode === "quota") return res.end(JSON.stringify({ responseStatus: 429, responseData: { translatedText: "MYMEMORY WARNING: YOU USED ALL AVAILABLE FREE TRANSLATIONS FOR TODAY" } }));
      const q = url.searchParams.get("q") ?? "";
      return res.end(JSON.stringify({ responseStatus: 200, responseData: { translatedText: `[PT] ${q}` } }));
    });
    await new Promise<void>((resolve) => fake.listen(3198, resolve));
    await clean();

    const base = { source: "anilist", onPlatform: true } as const;
    const entry = (anilistId: number, rank: number, description: string, extra = {}) =>
      prisma.catalogEntry.create({ data: { ...base, anilistId, titleRomaji: `Sinopse97 ${anilistId}`, description, popularityRank: rank, ...extra } });
    for (const [i, id] of BATCH.entries()) await entry(id, -300 + i, `Hero number ${i + 1} rises.`);
    for (const [i, id] of QUOTA.entries()) await entry(id, -200 + i, `Quota story ${i + 1}.`);
    await prisma.catalogEntry.create({ data: { ...base, anilistId: null, anidbId: ANIDB_ID, source: "anidb", titleRomaji: "Sinopse97 so AniDB", description: "A tale without an AniList page.", popularityRank: -299 } });
    // Páginas da obra: uma com a tradução já guardada e outra com o serviço fora.
    for (const [id, description, descriptionPt] of [
      [STORED, "A saved story in English.", "Uma história guardada em português."],
      [BROKEN, "A story that cannot be translated.", null],
    ] as const) {
      await entry(id, 50, description, { descriptionPt });
      const franchise = await prisma.franchise.create({ data: { rootAnilistId: id, name: `Sinopse97 ${id}` } });
      await prisma.production.create({ data: { anilistId: id, franchiseId: franchise.id, titleRomaji: `Sinopse97 ${id}`, seasonNumber: 1, description, genres: "Drama", streamingLinksJson: "[]", fetchedAt: new Date() } });
    }
  });

  test.afterAll(async () => {
    await clean();
    await new Promise<void>((resolve) => fake.close(() => resolve()));
    await prisma.$disconnect();
  });

  test("a tradução em lote guarda o português em cada obra, inclusive nas só do AniDB", async ({ request }) => {
    mode = "ok";
    const progress = await run(request, 4);
    expect(progress).toMatchObject({ lang: "pt", engine: "mymemory", translated: 4, failed: 0, quotaStopped: false, finished: true });

    for (const [i, id] of BATCH.entries()) {
      const entry = await prisma.catalogEntry.findUniqueOrThrow({ where: { anilistId: id } });
      expect(entry.descriptionPt).toBe(`[PT] Hero number ${i + 1} rises.`);
      expect((await prisma.synopsisTranslation.findUniqueOrThrow({ where: { anilistId_lang: { anilistId: id, lang: "pt" } } })).text).toBe(entry.descriptionPt);
    }
    const anidbOnly = await prisma.catalogEntry.findUniqueOrThrow({ where: { anidbId: ANIDB_ID } });
    expect(anidbOnly.descriptionPt).toBe("[PT] A tale without an AniList page.");
  });

  test("rodar de novo pula o que já está pronto e segue para a próxima da fila", async ({ request }) => {
    const touched = async () => (await prisma.catalogEntry.findMany({ where: { OR: [{ anilistId: { in: BATCH } }, { anidbId: ANIDB_ID }] }, select: { id: true, updatedAt: true } })).map((e) => `${e.id}:${e.updatedAt.getTime()}`).sort();
    const before = await touched();
    const progress = await run(request, 1);
    expect(progress.translated).toBe(1);
    expect(await touched()).toEqual(before); // as quatro já traduzidas nem foram tocadas
    await resetQuota();
  });

  test("quando a cota acaba, a tradução para e depois retoma do ponto em que parou", async ({ request }) => {
    mode = "ok";
    let served = 0;
    // Libera só a primeira chamada; as demais voltam o aviso de cota.
    const original = fake.listeners("request")[0] as (req: unknown, res: unknown) => void;
    fake.removeAllListeners("request");
    fake.on("request", (req, res) => {
      served += 1;
      mode = served > 1 ? "quota" : "ok";
      original(req, res);
    });
    try {
      const stopped = await run(request, 3);
      expect(stopped).toMatchObject({ translated: 1, quotaStopped: true });
      const done = await prisma.catalogEntry.findMany({ where: { anilistId: { in: QUOTA }, descriptionPt: { not: null } } });
      expect(done).toHaveLength(1);
    } finally {
      fake.removeAllListeners("request");
      fake.on("request", original);
      mode = "ok";
    }
    const resumed = await run(request, 2); // as duas que faltavam
    expect(resumed).toMatchObject({ translated: 2, quotaStopped: false });
    expect(await prisma.catalogEntry.count({ where: { anilistId: { in: QUOTA }, descriptionPt: { not: null } } })).toBe(3);
  });

  test("o serviço fora do ar interrompe sem apagar nada", async ({ request }) => {
    await resetQuota();
    mode = "down";
    const progress = await run(request, 3);
    expect(progress.translated).toBe(0);
    expect(progress.failed).toBe(3);
    expect(await prisma.catalogEntry.count({ where: { anilistId: { in: QUOTA }, descriptionPt: null } })).toBe(3);
    mode = "ok";
  });

  test("valida o pedido de tradução", async ({ request }) => {
    expect((await request.post("/api/admin/translation", { data: { lang: "fr" } })).status()).toBe(400);
    expect((await request.post("/api/admin/translation", { data: { limit: 0 } })).status()).toBe(400);
    expect((await request.post("/api/admin/translation", { data: { limit: "muitas" } })).status()).toBe(400);
  });

  test("a API de sinopse traduz e guarda a obra só do AniDB pelo id dela", async ({ request }) => {
    mode = "ok";
    await prisma.catalogEntry.update({ where: { anidbId: ANIDB_ID }, data: { descriptionPt: null } });
    const entry = await prisma.catalogEntry.findUniqueOrThrow({ where: { anidbId: ANIDB_ID } });
    const res = await request.get(`/api/synopsis?entryId=${entry.id}&lang=pt`);
    expect((await res.json()).synopsis).toMatchObject({ translated: true, text: "[PT] A tale without an AniList page." });
    expect((await prisma.catalogEntry.findUniqueOrThrow({ where: { anidbId: ANIDB_ID } })).descriptionPt).toBe("[PT] A tale without an AniList page.");
    expect((await request.get("/api/synopsis?entryId=../x&lang=pt")).status()).toBe(400);
  });

  test("a página da obra já nasce com a sinopse em português guardada, sem pedir a tradução", async ({ page }) => {
    const asked: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/synopsis")) asked.push(req.url());
    });
    await page.goto(`/anime/${STORED}`);
    await expect(page.getByTestId("synopsis").first()).toHaveText("Uma história guardada em português.");
    await expect(page.getByTestId("synopsis-untranslated")).toHaveCount(0);
    expect(asked).toEqual([]);
  });

  test("sem tradução possível, mostra o original em inglês com um aviso (e não o deixa 'traduzindo' para sempre)", async ({ page }) => {
    mode = "down";
    await page.goto(`/anime/${BROKEN}`);
    await expect(page.getByTestId("synopsis").first()).toHaveText("A story that cannot be translated.");
    await expect(page.getByTestId("synopsis-untranslated")).toContainText("a tradução não está disponível agora");
    mode = "ok";
  });

  test("o painel mostra quantas sinopses já estão em português", async ({ page }) => {
    await page.goto("/admin/curadoria");
    const panel = page.getByTestId("translation-panel");
    await expect(panel).toContainText("Sinopses em português");
    await expect(panel.getByTestId("translation-count")).toContainText("de");
    await expect(panel.getByTestId("translation-percent")).toHaveText(/^\d+%$/);
    await expect(panel.getByTestId("translation-note")).toContainText("MyMemory");
  });
});
