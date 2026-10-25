import { test, expect } from "@playwright/test";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Fase 2 (ADR 0008): a obra do catálogo é a identidade interna. Cópias e agenda apontam para ela por `catalogEntryId`, com
// chave estrangeira; a verificação de integridade acha o que ainda não está ligado e o admin liga em um clique.
const WORK = 103001;
const GONE = 103002; // anilistId que não existe no catálogo

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Integridade e identidade interna", () => {
  let prisma: PrismaClient;
  let entryId: string;

  async function clean() {
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [WORK, GONE] } } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: [WORK, GONE] } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: [WORK, GONE] } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: [WORK, GONE] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    entryId = (await prisma.catalogEntry.create({ data: { anilistId: WORK, titleRomaji: "Integridade Round103", source: "anilist", onPlatform: true, kind: "EPISODE", format: "TV" } })).id;
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    // Linhas antigas, criadas sem vínculo (como antes da Fase 2).
    await prisma.airingScheduleEntry.create({ data: { anilistId: WORK, episode: 1, airingAt: new Date(), titleRomaji: "Integridade Round103" } });
    await prisma.anime.create({ data: { userId, anilistId: WORK, titleRomaji: "Integridade Round103" } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("só o administrador consulta a integridade", async ({ request }) => {
    expect((await request.get("/api/admin/integrity")).status()).toBe(403);
    expect((await request.post("/api/admin/integrity", { data: { action: "link" } })).status()).toBe(403);
  });

  test.describe("como administrador", () => {
    test.use({ storageState: adminState });

    test("acha o que está sem vínculo e liga ao catálogo", async ({ request }) => {
      const before = await (await request.get("/api/admin/integrity")).json();
      const count = (key: string, data: { checks: Array<{ key: string; count: number }> }) => data.checks.find((c) => c.key === key)?.count ?? -1;
      expect(count("schedule_unlinked", before)).toBeGreaterThanOrEqual(1);
      expect(count("list_unlinked", before)).toBeGreaterThanOrEqual(1);

      expect((await request.post("/api/admin/integrity", { data: { action: "nada" } })).status()).toBe(400);
      const res = await request.post("/api/admin/integrity", { data: { action: "link" } });
      expect(res.status()).toBe(200);
      const after = await res.json();
      expect(after.linked.schedule).toBeGreaterThanOrEqual(1);
      expect(count("schedule_unlinked", after)).toBe(0);
      expect(count("list_unlinked", after)).toBe(0);

      expect((await prisma.airingScheduleEntry.findFirstOrThrow({ where: { anilistId: WORK } })).catalogEntryId).toBe(entryId);
      expect((await prisma.anime.findFirstOrThrow({ where: { anilistId: WORK } })).catalogEntryId).toBe(entryId);
    });
  });

  test("o banco recusa episódio apontando obra inexistente e não deixa apagar obra com dependentes (Cenário J)", async () => {
    await expect(prisma.airingScheduleEntry.create({ data: { anilistId: GONE, episode: 1, airingAt: new Date(), titleRomaji: "Fantasma", catalogEntryId: "nao-existe" } })).rejects.toThrow();
    await expect(prisma.catalogEntry.delete({ where: { id: entryId } })).rejects.toThrow();
    expect(await prisma.catalogEntry.count({ where: { id: entryId } })).toBe(1);
  });
});
