import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_SESSION_TOKEN } from "./test-auth";

// Admin → Curadoria: andamento visual da curadoria do catálogo e a lista de pendências (ADR).
const ENTRY = "round93-entry";
const TITLE = "Pendente Round93 Sem Ingles";
const JOB_NOTE = "Round93 job de curadoria";

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};

test.describe.serial("Admin — Curadoria", () => {
  let prisma: PrismaClient;

  let curatedId: string;
  let todoId: string;

  async function clean() {
    await prisma.curationIssue.deleteMany({ where: { OR: [{ entryId: ENTRY }, { anilistId: { in: [993011, 993012] } }] } });
    await prisma.catalogEntry.deleteMany({ where: { anilistId: { in: [993011, 993012] } } });
    await prisma.adminJob.deleteMany({ where: { kind: "CURATION", progressNote: JOB_NOTE } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    curatedId = (await prisma.catalogEntry.create({ data: { anilistId: 993011, titleRomaji: "Curada Round93", source: "anilist", onPlatform: true, kind: "OVA", genres: "Drama,Comedy", curationVersion: 1, curatedAt: new Date() } })).id;
    todoId = (await prisma.catalogEntry.create({ data: { anilistId: 993012, titleRomaji: "Falta Round93", source: "anilist", onPlatform: true, curationVersion: 0 } })).id;
    await prisma.curationIssue.create({ data: { entryId: curatedId, code: "NO_GENRE", title: "Curada Round93", anilistId: 993011 } });
    await prisma.curationIssue.create({ data: { entryId: ENTRY, code: "TITLE_EN_MISSING", title: TITLE, anilistId: 993001 } });
    await prisma.curationIssue.create({ data: { entryId: ENTRY, code: "OFFICIAL_SITE_MISSING", title: TITLE, anilistId: 993001, detail: 'tem, vírgula e "aspas"' } });
    const startedAt = new Date().toISOString();
    const progress = {
      version: 1, total: 100, done: 40, startedAt, updatedAt: new Date().toISOString(), finished: false,
      changed: { titles: 7, synopsis: 3, genres: 21, officialSite: 12, kind: 40, relations: 9, translations: 2 },
      kinds: { EPISODE: 30, OVA: 5, ODA: 2, MOVIE: 3 },
      issues: { TITLE_EN_MISSING: 4 }, adultRemoved: 0, failedBatches: 0, withPt: 2, withJa: 0, currentTitle: "Obra Em Curso Round93",
    };
    await prisma.adminJob.create({ data: { kind: "CURATION", source: "Catálogo", season: "Curadoria v1", state: "RUNNING", stage: "COMMIT", progressNote: JOB_NOTE, processed: 40, total: 100, resultJson: JSON.stringify(progress) } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("só o administrador vê e inicia a curadoria", async ({ playwright, baseURL }) => {
    const guest = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    for (const url of ["/api/admin/curation", "/api/admin/curation/issues?code=NO_GENRE", "/api/admin/curation/entries"]) expect((await guest.get(url)).status()).toBe(401);
    expect((await guest.post("/api/admin/curation", { data: {} })).status()).toBe(401);
    await guest.dispose();
    const member = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_TOKEN}` } }); // usuário comum
    for (const url of ["/api/admin/curation", "/api/admin/curation/issues?code=NO_GENRE", "/api/admin/curation/entries"]) expect((await member.get(url)).status()).toBe(403);
    expect((await member.post("/api/admin/curation", { data: {} })).status()).toBe(403);
    await member.dispose();
  });

  test.describe("como administrador", () => {
    test.use({ storageState: adminState });

    test("valida o que recebe", async ({ request }) => {
      expect((await request.post("/api/admin/curation", { data: { force: "sim" } })).status()).toBe(400);
      expect((await request.get("/api/admin/curation/issues")).status()).toBe(400);
      expect((await request.get("/api/admin/curation/issues?code=INVENTADO")).status()).toBe(400);
    });

    test("recusa iniciar outra curadoria enquanto uma roda", async ({ request }) => {
      const res = await request.post("/api/admin/curation", { data: {} });
      expect(res.status()).toBe(409);
    });

    test("o andamento mostra a barra, o que foi corrigido, os tipos e a obra em curso", async ({ page }) => {
      await page.goto("/admin/curadoria");
      await expect(page.getByRole("heading", { name: "Curadoria do catálogo" })).toBeVisible();
      const progress = page.getByTestId("curation-progress");
      await expect(progress.getByTestId("curation-state")).toHaveText("Rodando");
      await expect(progress.getByTestId("curation-count")).toContainText("40");
      await expect(progress.getByTestId("curation-percent")).toHaveText(/^\d+%$/);
      await expect(progress.getByTestId("curation-note")).toContainText("Obra Em Curso Round93");
      await expect(page.getByTestId("curation-start")).toBeDisabled(); // já tem uma rodando
      await expect(page.getByTestId("curation-changed-titles")).toHaveText("7");
      await expect(page.getByTestId("curation-changed-genres")).toHaveText("21");
      await expect(page.getByTestId("curation-changed-translations")).toHaveText("2");
      await expect(page.getByRole("progressbar", { name: "Andamento da curadoria" })).toBeVisible();
    });

    test("a lista de pendências mostra a contagem, abre os itens e exporta CSV", async ({ page, request }) => {
      await page.goto("/admin/curadoria");
      const card = page.getByTestId("curation-issue-TITLE_EN_MISSING");
      await expect(card).toContainText("Sem título em inglês");
      await expect(card.getByTestId("curation-issue-count-TITLE_EN_MISSING")).not.toHaveText("· 0");
      await card.getByRole("button", { name: "Ver" }).click();
      await expect(page.getByTestId("curation-issue-list-TITLE_EN_MISSING")).toContainText(TITLE);
      await expect(page.getByTestId("curation-issue-list-TITLE_EN_MISSING")).toContainText("AniList 993001");
      await card.getByRole("button", { name: "Fechar" }).click();
      await expect(page.getByTestId("curation-issue-list-TITLE_EN_MISSING")).toHaveCount(0);

      const csv = await request.get("/api/admin/curation/issues?code=OFFICIAL_SITE_MISSING&format=csv");
      expect(csv.status()).toBe(200);
      expect(csv.headers()["content-type"]).toContain("text/csv");
      expect(csv.headers()["content-disposition"]).toContain("curadoria-official_site_missing.csv");
      const body = await csv.text();
      expect(body).toContain("titulo,anilistId,anidbId,detalhe");
      expect(body).toContain(`${TITLE},993001,,"tem, vírgula e ""aspas"""`);
    });

    test("a lista de todas as obras mostra o estado de cada uma e filtra", async ({ page }) => {
      await page.goto("/admin/curadoria");
      const list = page.getByTestId("curation-entries");
      await list.getByTestId("curation-entries-search").fill("Round93");
      await list.getByRole("button", { name: "Buscar" }).click();
      await expect(list.getByTestId(`curation-row-${curatedId}`)).toContainText("Curada Round93");
      await expect(list.getByTestId(`curation-row-${curatedId}`)).toContainText("OVA");
      await expect(list.getByTestId(`curation-row-${curatedId}`)).toContainText("Drama, Comedy");
      await expect(list.getByTestId(`curation-row-state-${curatedId}`)).toHaveText("Curada");
      await expect(list.getByTestId(`curation-row-state-${todoId}`)).toHaveText("Falta");
      await expect(list.getByTestId(`curation-row-${curatedId}`)).toContainText("sem gênero"); // pendência em aberto

      await list.getByTestId("curation-entries-filter").selectOption("todo");
      await expect(list.getByTestId(`curation-row-${todoId}`)).toBeVisible();
      await expect(list.getByTestId(`curation-row-${curatedId}`)).toHaveCount(0);

      await list.getByTestId("curation-entries-filter").selectOption("curated");
      await expect(list.getByTestId(`curation-row-${curatedId}`)).toBeVisible();
      await expect(list.getByTestId(`curation-row-${todoId}`)).toHaveCount(0);

      await list.getByTestId("curation-entries-filter").selectOption("issues");
      await expect(list.getByTestId(`curation-row-${curatedId}`)).toBeVisible();
      await expect(list.getByTestId(`curation-row-${todoId}`)).toHaveCount(0);

      await list.getByTestId("curation-entries-search").fill("Nao Existe Round93");
      await list.getByRole("button", { name: "Buscar" }).click();
      await expect(list.getByTestId("curation-entries-empty")).toBeVisible();
    });

    test("a API da lista valida o filtro e pagina", async ({ request }) => {
      expect((await request.get("/api/admin/curation/entries?filter=qualquer")).status()).toBe(400);
      const res = await request.get("/api/admin/curation/entries?filter=todo&q=Round93");
      const body = await res.json();
      expect(body).toMatchObject({ total: 1, page: 0, pageSize: 50 });
      expect(body.items[0]).toMatchObject({ title: "Falta Round93", curated: false, issues: [] });
    });

    test("a API de pendências pagina e devolve o porquê", async ({ request }) => {
      const res = await request.get("/api/admin/curation/issues?code=TITLE_EN_MISSING&page=0");
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toMatchObject({ code: "TITLE_EN_MISSING", pageSize: 50, page: 0 });
      expect(body.total).toBeGreaterThanOrEqual(1);
      expect(body.items.some((i: { title: string }) => i.title === TITLE)).toBe(true);
      expect(body.why).toBeTruthy();
    });
  });
});
