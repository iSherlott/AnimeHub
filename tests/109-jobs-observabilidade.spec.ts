import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Fase 8: visão unificada de jobs e serviços, detalhe genérico, trava de concorrência com sinal de vida (o vivo bloqueia;
// o sem sinal é dado como interrompido), cancelamento cooperativo e exportação.
const LABEL = "Round109";

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Jobs e observabilidade", () => {
  let prisma: PrismaClient;

  async function clean() {
    const jobs = await prisma.adminJob.findMany({ where: { OR: [{ season: { contains: LABEL } }, { kind: { in: ["CURATION", "ANILIST"] }, state: "RUNNING" }] }, select: { seq: true } });
    await prisma.adminLog.deleteMany({ where: { jobSeq: { in: jobs.map((j) => j.seq) } } });
    await prisma.adminJob.deleteMany({ where: { seq: { in: jobs.map((j) => j.seq) } } });
    await prisma.adminJob.deleteMany({ where: { kind: "ANILIST", season: { contains: "Trazer 1" } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("só o administrador vê, exporta e cancela jobs", async ({ request }) => {
    expect((await request.get("/api/admin/jobs/export")).status()).toBe(403);
    expect((await request.post("/api/admin/jobs/1", { data: { action: "cancel" } })).status()).toBe(403);
  });

  test.describe("como administrador", () => {
    test.use({ storageState: adminState });

    test("um job vivo bloqueia outro do mesmo tipo; sem sinal de vida, é dado como interrompido", async ({ request }) => {
      const alive = await prisma.adminJob.create({ data: { kind: "ANILIST", source: "AniList", season: `Vivo ${LABEL}`, state: "RUNNING", stage: "COMMIT", heartbeatAt: new Date() } });
      const busy = await request.post("/api/admin/anilist/import", { data: { ids: [109001] } });
      expect(busy.status()).toBe(409);
      expect((await busy.json()).running).toBe(alive.seq);

      // Sem sinal há 30 min: o próximo pedido marca o antigo como interrompido e começa (aqui a AniList falsa não responde).
      await prisma.adminJob.update({ where: { seq: alive.seq }, data: { heartbeatAt: new Date(Date.now() - 30 * 60_000) } });
      const next = await request.post("/api/admin/anilist/import", { data: { ids: [109001] } });
      expect(next.status()).not.toBe(409);
      const old = await prisma.adminJob.findUniqueOrThrow({ where: { seq: alive.seq } });
      expect(old).toMatchObject({ state: "FAILED", error: "Interrompido (sem sinal de vida)." });
      expect(await prisma.adminLog.count({ where: { jobSeq: alive.seq, event: "Job stale" } })).toBe(1);
    });

    test("a curadoria recusa começar com outra viva (409)", async ({ request }) => {
      const alive = await prisma.adminJob.create({ data: { kind: "CURATION", source: "Catálogo", season: `Curadoria ${LABEL}`, state: "RUNNING", stage: "COMMIT", heartbeatAt: new Date() } });
      const res = await request.post("/api/admin/curation", { data: {} });
      expect(res.status()).toBe(409);
      expect((await res.json()).seq).toBe(alive.seq);
    });

    test("cancelar é cooperativo, só para jobs com cancelamento seguro, e aparece no detalhe", async ({ page, request }) => {
      const job = await prisma.adminJob.findFirstOrThrow({ where: { kind: "CURATION", season: `Curadoria ${LABEL}` } });
      await page.goto(`/admin/jobs/${job.seq}`);
      await expect(page.getByTestId("job-facts")).toContainText("Curadoria");
      await page.getByTestId("job-cancel").click();
      await page.getByTestId("job-cancel-confirm").click();
      await expect(page.getByTestId("job-cancel-message")).toContainText("Cancelamento pedido");
      expect((await prisma.adminJob.findUniqueOrThrow({ where: { seq: job.seq } })).cancelRequestedAt).not.toBeNull();
      expect(await prisma.adminLog.count({ where: { jobSeq: job.seq, event: "Cancel requested" } })).toBe(1);

      const imp = await prisma.adminJob.create({ data: { kind: "IMPORT", source: "AniDB", season: `Importação ${LABEL}`, state: "RUNNING", stage: "MATCHING" } });
      expect((await request.post(`/api/admin/jobs/${imp.seq}`, { data: { action: "cancel" } })).status()).toBe(400);
      const done = await prisma.adminJob.create({ data: { kind: "TRANSLATION", source: "Catálogo", season: `Tradução ${LABEL}`, state: "SUCCESS", stage: "NOTIFICATION", finishedAt: new Date() } });
      expect((await request.post(`/api/admin/jobs/${done.seq}`, { data: { action: "cancel" } })).status()).toBe(409);
    });

    test("a lista mostra tipos, serviços, origem e duração; filtra falhas; exporta CSV", async ({ page, request }) => {
      await prisma.adminJob.create({ data: { kind: "FIELD_UPDATE", source: "AniList", season: `Falha ${LABEL}`, state: "FAILED", stage: "COLLECT", error: "AniList fora", adminName: "Admin", finishedAt: new Date() } });
      await page.goto(`/admin/jobs?q=${LABEL}`);
      await expect(page.getByTestId("jobs-kinds")).toContainText("Curadoria");
      await expect(page.getByTestId("jobs-services")).toContainText("Carregador da agenda");
      const list = page.getByTestId("admin-jobs-list");
      await expect(list).toContainText("Atualização seletiva");
      await expect(list).toContainText("manual · Admin");
      await page.goto(`/admin/jobs?q=${LABEL}&falhas=1`);
      await expect(page.getByTestId("admin-jobs-list")).not.toContainText("Curadoria ·");

      const csv = await (await request.get(`/api/admin/jobs/export?q=${LABEL}`)).text();
      expect(csv.split("\n")[0]).toContain("duracao_s");
      expect(csv).toContain("FIELD_UPDATE");
      expect(csv).not.toContain("<html");
    });
  });
});
