import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// Admin → Importações → Matching → Conflitos → Commit → Overrides (Figma 8:3436…8:5077).
// Nada vai ao catálogo antes da confirmação explícita; o override é auditável e reversível.
const ANILIST_AUTO = 964101;
const ANILIST_REVIEW = 964102;
const ANIDB_AUTO = 19777;
const ANIDB_REVIEW = 19001;
const ANIDB_NEW = 19888;

const adminState = {
  cookies: [
    {
      name: SESSION_COOKIE_NAME,
      value: TEST_ADMIN_SESSION_TOKEN,
      domain: "localhost",
      path: "/",
      expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
      httpOnly: true,
      secure: false,
      sameSite: "Lax" as const,
    },
  ],
  origins: [],
};

test.describe("Admin — fluxo de importação revisada", () => {
  test.use({ storageState: adminState });
  test.describe.configure({ mode: "serial" });

  let prisma: PrismaClient;
  let seq = 0;
  const originalAt = new Date(Date.now() + 2 * 3600_000);
  const importedAt = new Date(originalAt.getTime() + 3600_000);
  const jobSeqs: number[] = [];

  const html = `<section data-season="Autumn2026">
    <article data-anidb-id="${ANIDB_AUTO}" data-type="TV" data-year="2026" data-aired="${importedAt.toISOString()}"><h2>Zzyx Boss Arawareta</h2></article>
    <article data-anidb-id="${ANIDB_REVIEW}" data-year="2026"><h2>Qwv Mist Kiri</h2></article>
    <article data-anidb-id="${ANIDB_NEW}" data-type="movie"><h2>Plm Forest Mori</h2></article>
  </section>`;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await cleanup();
    const f1 = await prisma.franchise.create({ data: { rootAnilistId: 964001, name: "Zzyx Round64" } });
    const f2 = await prisma.franchise.create({ data: { rootAnilistId: 964002, name: "Qwv Round64" } });
    await prisma.production.create({ data: { anilistId: ANILIST_AUTO, franchiseId: f1.id, titleRomaji: "Zzyx Boss Arawareta", season: "FALL", seasonYear: 2026, format: "TV" } });
    await prisma.production.create({ data: { anilistId: ANILIST_REVIEW, franchiseId: f2.id, titleRomaji: "Qwv Mist Kiri", season: "FALL", seasonYear: 2023, format: "TV" } });
    await prisma.airingScheduleEntry.create({ data: { anilistId: ANILIST_AUTO, episode: 3, airingAt: originalAt, titleRomaji: "Zzyx Boss Arawareta" } });
  });

  async function cleanup() {
    await prisma.catalogOverride.deleteMany({ where: { anilistId: { in: [ANILIST_AUTO, ANILIST_REVIEW] } } });
    await prisma.catalogConflict.deleteMany({ where: { anilistId: { in: [ANILIST_AUTO, ANILIST_REVIEW] } } });
    await prisma.adminJob.deleteMany({ where: { seq: { in: jobSeqs } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [ANILIST_AUTO, ANILIST_REVIEW] } } });
    await prisma.catalogEntry.deleteMany({ where: { anidbId: ANIDB_NEW } });
    await prisma.production.deleteMany({ where: { anilistId: { in: [ANILIST_AUTO, ANILIST_REVIEW] } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: [964001, 964002] } } });
  }

  test.afterAll(async () => {
    await cleanup();
    await prisma.$disconnect();
  });

  test("HTML vazio bloqueia ANALISAR com a mensagem junto ao campo", async ({ page }) => {
    await page.goto("/admin/importacoes");
    await expect(page.getByRole("heading", { level: 1, name: "Importar temporada" })).toBeVisible();
    await page.getByRole("button", { name: "Analisar" }).click();
    await expect(page.getByText("Cole o HTML da temporada para analisar.")).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/importacoes$/);
  });

  test("ANALISAR gera só a prévia: 3 encontrados, 1 automático, 1 novo, 2 pendências — e nada é salvo", async ({ page }) => {
    await page.goto("/admin/importacoes");
    await page.getByLabel("HTML da temporada").fill(html);
    await page.getByRole("button", { name: "Analisar" }).click();
    await expect(page).toHaveURL(/\/admin\/importacoes\/\d+$/, { timeout: 20_000 });
    seq = Number(page.url().split("/").pop());
    jobSeqs.push(seq);

    await expect(page.getByTestId("result-found")).toContainText("3");
    await expect(page.getByTestId("result-matched")).toContainText("1");
    await expect(page.getByTestId("result-new")).toContainText("1");
    await expect(page.getByTestId("result-pending")).toContainText("2");
    await expect(page.getByTestId("result-blocked")).toContainText("2 registros precisam de confirmação");
    await expect(page.getByTestId("confirm-import")).toBeDisabled();
    await expect(page.getByRole("link", { name: "Resolver 2 pendências" })).toBeVisible();

    // Prévia: o catálogo continua intacto.
    expect((await prisma.production.findUniqueOrThrow({ where: { anilistId: ANILIST_AUTO } })).anidbId).toBeNull();
    expect(await prisma.catalogEntry.count({ where: { anidbId: ANIDB_NEW } })).toBe(0);
    // O horário da fonte ainda é o original.
    expect(await prisma.catalogOverride.count({ where: { anilistId: ANILIST_AUTO } })).toBe(0);
  });

  test("Matching: revisar o candidato e confirmar volta ao resultado com uma pendência a menos", async ({ page }) => {
    await page.goto(`/admin/importacoes/${seq}`);
    await page.getByRole("link", { name: "Resolver 2 pendências" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Revisar correspondência" })).toBeVisible();
    await expect(page.getByTestId("match-source")).toContainText("Qwv Mist Kiri");
    await expect(page.getByTestId("match-candidate")).toContainText("Qwv Mist Kiri");
    await expect(page.getByTestId("match-score")).toContainText("Score de correspondência");
    await page.getByTestId("match-confirm").click();
    await expect(page).toHaveURL(`/admin/importacoes/${seq}`);
    await expect(page.getByTestId("result-pending")).toContainText("1");
  });

  test("Conflitos: usar a fonte B cria um override auditável e libera o commit", async ({ page }) => {
    await page.goto(`/admin/importacoes/${seq}`);
    await page.getByRole("link", { name: "Resolver 1 pendência" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Conflito de broadcast" })).toBeVisible();
    await expect(page.getByText("Fonte A", { exact: false }).first()).toBeVisible();
    await page.getByTestId("conflict-use-b").click();
    await expect(page.getByTestId("conflict-resolved")).toContainText("fonte B escolhida");

    const override = await prisma.catalogOverride.findFirstOrThrow({ where: { anilistId: ANILIST_AUTO, episode: 3, removedAt: null } });
    expect(override.value.getTime()).toBe(importedAt.getTime());
    expect(override.originalValue.getTime()).toBe(originalAt.getTime()); // o original é preservado

    await page.goto(`/admin/importacoes/${seq}`);
    await expect(page.getByTestId("result-ready")).toBeVisible();
    await expect(page.getByTestId("confirm-import")).toBeEnabled();
  });

  test("o calendário passa a usar o horário do override, sem apagar o original", async ({ request }) => {
    const weekStart = Math.floor((Date.now() - 86400_000) / 1000);
    const data = await (await request.get(`/api/calendar?weekStart=${weekStart}`)).json();
    const item = data.results.find((r: { key: string }) => r.key === `${ANILIST_AUTO}-3`);
    expect(new Date(item.airingAt).getTime()).toBe(importedAt.getTime());
    const row = await prisma.airingScheduleEntry.findFirstOrThrow({ where: { anilistId: ANILIST_AUTO, episode: 3 } });
    expect(row.airingAt.getTime()).toBe(originalAt.getTime());
  });

  test("Confirmar importação: diálogo com foco em Cancelar; só o commit explícito aplica ao catálogo", async ({ page }) => {
    await page.goto(`/admin/importacoes/${seq}`);
    await page.getByTestId("confirm-import").click();
    const dialog = page.getByRole("dialog", { name: "Confirmar importação?" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Efeito da ação");
    await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    await expect(dialog).toBeHidden();
    expect((await prisma.production.findUniqueOrThrow({ where: { anilistId: ANILIST_AUTO } })).anidbId).toBeNull();

    await page.getByTestId("confirm-import").click();
    await page.getByTestId("confirm-import-dialog").click();
    await expect(page).toHaveURL(`/admin/jobs/${seq}`, { timeout: 20_000 });
    await expect(page.getByTestId("job-progress")).toContainText("Success");

    expect((await prisma.production.findUniqueOrThrow({ where: { anilistId: ANILIST_AUTO } })).anidbId).toBe(ANIDB_AUTO);
    expect((await prisma.production.findUniqueOrThrow({ where: { anilistId: ANILIST_REVIEW } })).anidbId).toBe(ANIDB_REVIEW);
    const created = await prisma.catalogEntry.findUniqueOrThrow({ where: { anidbId: ANIDB_NEW } });
    expect(created.titleRomaji).toBe("Plm Forest Mori");
    expect(created.source).toBe("anidb");
  });

  test("um commit repetido é recusado", async ({ request }) => {
    const res = await request.post(`/api/admin/imports/${seq}/commit`);
    expect(res.status()).toBe(409);
  });

  test("Logs registram a importação com contexto, e Jobs mostra todas as etapas concluídas", async ({ page }) => {
    await page.goto(`/admin/logs?job=${seq}`);
    const table = page.getByTestId("admin-logs-table");
    await expect(table).toContainText("Import started");
    await expect(table).toContainText("3 parsed");
    await expect(table).toContainText("Conflict resolved");
    await expect(table).toContainText("Import completed");

    await page.goto(`/admin/jobs/${seq}`);
    await expect(page.getByTestId("job-steps").getByText("Success")).toHaveCount(6);
  });

  test("Overrides: remover exige confirmação e devolve o horário original", async ({ page, request }) => {
    await page.goto("/admin/overrides");
    const table = page.getByTestId("admin-overrides-table");
    await expect(table).toContainText("Horário de exibição");
    const override = await prisma.catalogOverride.findFirstOrThrow({ where: { anilistId: ANILIST_AUTO, removedAt: null } });
    await page.getByTestId(`remove-override-${override.id}`).click();
    const dialog = page.getByRole("dialog", { name: "Remover override?" });
    await expect(dialog).toContainText("O valor original não é apagado");
    await expect(dialog.getByRole("button", { name: "Cancelar" })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    expect((await prisma.catalogOverride.findUniqueOrThrow({ where: { id: override.id } })).removedAt).toBeNull();

    await page.getByTestId(`remove-override-${override.id}`).click();
    await page.getByTestId("remove-override-confirm").click();
    await expect(page.getByRole("dialog")).toBeHidden();
    expect((await prisma.catalogOverride.findUniqueOrThrow({ where: { id: override.id } })).removedAt).not.toBeNull();

    const weekStart = Math.floor((Date.now() - 86400_000) / 1000);
    const data = await (await request.get(`/api/calendar?weekStart=${weekStart}`)).json();
    const item = data.results.find((r: { key: string }) => r.key === `${ANILIST_AUTO}-3`);
    expect(new Date(item.airingAt).getTime()).toBe(originalAt.getTime());
  });

  test("falha de parse vira um job Failed que preserva o HTML e oferece nova tentativa", async ({ page }) => {
    await page.goto("/admin/importacoes");
    await page.getByLabel("HTML da temporada").fill("<p>isto não é uma listagem de temporada</p>");
    await page.getByRole("button", { name: "Analisar" }).click();
    const failure = page.getByTestId("import-failure");
    await expect(failure).toContainText("Falha ao processar importação.");
    await expect(failure).toContainText("Nenhum registro encontrado");
    await expect(page.getByLabel("HTML da temporada")).toHaveValue(/isto não é uma listagem/);

    const failed = await prisma.adminJob.findFirstOrThrow({ where: { state: "FAILED" }, orderBy: { seq: "desc" } });
    jobSeqs.push(failed.seq);
    await page.goto(`/admin/jobs/${failed.seq}`);
    await expect(page.getByTestId("job-failed")).toContainText("Falha ao processar importação.");
    await expect(page.getByTestId("job-failed").getByRole("button", { name: "Tentar novamente" })).toBeVisible();
  });
});

test.describe("Admin — telas operacionais", () => {
  test.use({ storageState: adminState });

  test("todas as seções abrem para o administrador, com o título certo", async ({ page }) => {
    const pages: Array<[string, string]> = [
      ["/admin", "Operação do catálogo"],
      ["/admin/catalogo", "Catálogo"],
      ["/admin/importacoes", "Importar temporada"],
      ["/admin/matching", "Matching"],
      ["/admin/scrapers", "Scrapers"],
      ["/admin/jobs", "Jobs"],
      ["/admin/conflitos", "Conflitos"],
      ["/admin/overrides", "Overrides"],
      ["/admin/logs", "Logs"],
    ];
    for (const [path, title] of pages) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(200);
      await expect(page.getByRole("heading", { level: 1 }).first(), path).toContainText(title);
      await expect(page.getByRole("navigation", { name: "Administração" })).toBeVisible();
    }
  });

  test("Scrapers não oferece coleta de sites de terceiros (D-30): o único botão é o da busca de imagens na Kitsu", async ({ page }) => {
    await page.goto("/admin/scrapers");
    await expect(page.getByText("Coleta de sites de terceiros desativada")).toBeVisible();
    await expect(page.getByRole("button", { name: /Executar/ })).toHaveCount(1);
    await expect(page.getByTestId("run-episode-images")).toBeVisible();
  });
});

test.describe("Admin — acesso restrito", () => {
  test("a API de importação exige administrador", async ({ request }) => {
    for (const [method, url] of [
      ["POST", "/api/admin/imports"],
      ["POST", "/api/admin/imports/1/commit"],
      ["POST", "/api/admin/imports/1/cancel"],
      ["PATCH", "/api/admin/import-records/x"],
      ["PATCH", "/api/admin/conflicts/x"],
      ["DELETE", "/api/admin/overrides/x"],
      ["GET", "/api/admin/productions?q=ab"],
    ] as const) {
      const res = await request.fetch(url, { method, data: {} });
      expect(res.status(), `${method} ${url}`).toBe(403);
    }
  });
});
