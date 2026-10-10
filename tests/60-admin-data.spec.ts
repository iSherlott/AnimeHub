import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// F13a (ADMIN-003/004/006): Admin → Execuções (jobs/logs) e Catálogo
// Franquia → Produção, somente leitura e restritos a administradores.
const SOURCE = "teste-loader";
const ROOT = 960100;
const ADMIN = { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` };

test.describe("Admin: execuções e catálogo", () => {
  let prisma: PrismaClient;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.ingestionRun.deleteMany({ where: { source: SOURCE } });
    const t = Date.now();
    await prisma.ingestionRun.createMany({
      data: [
        { source: SOURCE, startedAt: new Date(t - 3 * 3600_000), finishedAt: new Date(t - 3 * 3600_000 + 4000), status: "OK", itemsProcessed: 1200 },
        { source: SOURCE, startedAt: new Date(t - 3600_000), finishedAt: new Date(t - 3600_000 + 2000), status: "PARTIAL", itemsProcessed: 800, itemsFailed: 2, message: "429 da fonte" },
      ],
    });
    const franchise = await prisma.franchise.upsert({
      where: { rootAnilistId: ROOT },
      create: { rootAnilistId: ROOT, name: "Franquia Catalogada Zeta" },
      update: {},
    });
    for (const [i, id] of [ROOT, ROOT + 1].entries()) {
      await prisma.production.upsert({
        where: { anilistId: id },
        create: { anilistId: id, franchiseId: franchise.id, seasonNumber: i + 1, titleRomaji: `Zeta Obra T${i + 1}`, format: "TV", fetchedAt: new Date() },
        update: {},
      });
    }
  });

  test.afterAll(async () => {
    await prisma.ingestionRun.deleteMany({ where: { source: SOURCE } });
    await prisma.$disconnect();
  });

  test("API: só administradores (401 anônimo, 403/404 membro) e resumo por fonte", async ({ request, playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await anon.get("/api/admin/ingestion-runs")).status()).toBe(401);
    expect((await anon.get("/api/admin/catalog")).status()).toBe(401);
    await anon.dispose();

    // o usuário de teste padrão é MEMBER
    const member = await request.get("/api/admin/ingestion-runs");
    expect([403, 404]).toContain(member.status());

    const admin = await playwright.request.newContext({ baseURL, extraHTTPHeaders: ADMIN });
    const data = await (await admin.get(`/api/admin/ingestion-runs?source=${SOURCE}`)).json();
    expect(data.runs).toHaveLength(2);
    expect(data.runs[0]).toMatchObject({ source: SOURCE, status: "PARTIAL", itemsFailed: 2, message: "429 da fonte" });
    const job = data.summary.find((s: { source: string }) => s.source === SOURCE);
    expect(job.lastStatus).toBe("PARTIAL");
    expect(job.lastSuccessAt).toBeTruthy();
    await admin.dispose();
  });

  test("API: catálogo agrupa produções por franquia e busca por título e AniList id", async ({ playwright, baseURL }) => {
    const admin = await playwright.request.newContext({ baseURL, extraHTTPHeaders: ADMIN });
    const byTitle = await (await admin.get("/api/admin/catalog?q=catalogada zeta")).json();
    expect(byTitle.franchises).toHaveLength(1);
    expect(byTitle.franchises[0].productions.map((p: { titleRomaji: string }) => p.titleRomaji)).toEqual(["Zeta Obra T1", "Zeta Obra T2"]);

    const byId = await (await admin.get(`/api/admin/catalog?q=${ROOT + 1}`)).json();
    expect(byId.franchises.map((f: { rootAnilistId: number }) => f.rootAnilistId)).toContain(ROOT);

    const none = await (await admin.get("/api/admin/catalog?q=naoexisteabsolutamente")).json();
    expect(none.franchises).toHaveLength(0);
    await admin.dispose();
  });

  test("UI: painel mostra o job com estado e o catálogo pesquisável", async ({ browser, baseURL }) => {
    const ctx = await browser.newContext({
      baseURL,
      storageState: { cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", httpOnly: true, secure: false, sameSite: "Lax", expires: -1 }], origins: [] },
    });
    const page = await ctx.newPage();
    await page.goto("/admin/acesso");
    const job = page.getByTestId(`job-${SOURCE}`);
    await expect(job).toContainText("Parcial");
    await expect(page.getByRole("table", { name: "Execuções recentes" })).toContainText("429 da fonte");

    await page.getByLabel("Buscar no catálogo").fill("Catalogada Zeta");
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page.getByTestId("catalog")).toContainText("Zeta Obra T2");
    await ctx.close();
  });
});
