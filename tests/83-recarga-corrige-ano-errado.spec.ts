import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Um lote carregado com o ano errado (HTML de 2025 como "Summer2026") grava o AniDB nas obras de 2026. Recarregar com
// o ano certo precisa corrigir isso: a identidade antiga não manda mais e o vínculo muda para a obra certa.
const WRONG = 983001; // obra de 2026, com o vínculo errado
const RIGHT = 983002; // a mesma obra em 2025
const ANIDB = 29831;
const IDS = [WRONG, RIGHT];

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

const html = `<div class="g_bubblewrap g_bubble container">
  <div class="g_bubble box no1" id="a${ANIDB}">
    <div class="data">
      <div class="wrap name"><a class="name-colored" href="/anime/${ANIDB}">Obra Relink Round83</a></div>
      <div class="date">5th July</div>
      <div class="general">TV Series, 12 eps</div>
    </div>
  </div>
</div>`;

test.describe("Recarga com o ano certo corrige o vínculo do ano errado", () => {
  test.use({ storageState: adminState });
  let prisma: PrismaClient;

  async function clean() {
    await prisma.adminJob.deleteMany({ where: { records: { some: { sourceKey: String(ANIDB) } } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: IDS } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: IDS } } });
    await prisma.catalogEntry.deleteMany({ where: { anilistId: { in: IDS } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    for (const [anilistId, seasonYear, anidbId] of [[WRONG, 2026, ANIDB], [RIGHT, 2025, null]] as const) {
      const franchise = await prisma.franchise.create({ data: { rootAnilistId: anilistId, name: `Franquia ${anilistId}` } });
      await prisma.production.create({ data: { anilistId, franchiseId: franchise.id, titleRomaji: "Obra Relink Round83", seasonNumber: 1, season: "SUMMER", seasonYear, format: "TV", genres: "Comedy", streamingLinksJson: "[]", anidbId, fetchedAt: new Date() } });
      await prisma.catalogEntry.create({ data: { anilistId, titleRomaji: "Obra Relink Round83", season: "SUMMER", seasonYear, genres: "Comedy", source: "anilist", onPlatform: true } });
    }
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("a obra certa (2025) é achada apesar do vínculo antigo, e o vínculo muda para ela", async ({ request }) => {
    const analyzed = await request.post("/api/admin/imports", { data: { html, source: "AniDB", season: "Summer2025" } });
    expect(analyzed.status()).toBe(201);
    const { seq } = await analyzed.json();

    const record = await prisma.importRecord.findFirstOrThrow({ where: { jobSeq: seq, sourceKey: String(ANIDB) } });
    expect(record.state).toBe("AUTO");
    expect(record.matchedAnilistId).toBe(RIGHT);

    const committed = await request.post(`/api/admin/imports/${seq}/commit`);
    expect(committed.status()).toBe(200);
    expect((await prisma.production.findUniqueOrThrow({ where: { anilistId: RIGHT } })).anidbId).toBe(ANIDB);
    expect((await prisma.production.findUniqueOrThrow({ where: { anilistId: WRONG } })).anidbId).toBeNull();
    const log = await prisma.adminLog.findFirst({ where: { jobSeq: seq, message: { contains: "saiu de" } } });
    expect(log).not.toBeNull();
  });
});
