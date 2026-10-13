import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// (1) A carga mostra o andamento enquanto roda; (2) obras já terminadas ganham "Finalizei" / "Pendente" em Minha Lista.
const FIN = 979001;
const adminState = {
  cookies: [
    { name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const },
  ],
  origins: [],
};

test.describe("Andamento da carga (admin)", () => {
  test.use({ storageState: adminState });
  let prisma: PrismaClient;
  let seq = 0;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const job = await prisma.adminJob.create({ data: { kind: "IMPORT", source: "AniDB", season: "Autumn2026", state: "RUNNING", stage: "MATCHING", total: 100, processed: 40, progressNote: "Comparando com o catálogo: 40 de 100" } });
    seq = job.seq;
  });

  test.afterAll(async () => {
    await prisma.adminJob.deleteMany({ where: { seq } });
    await prisma.$disconnect();
  });

  test("a API devolve etapa, contagem e frase do passo; sem passo ativo diz isso", async ({ request }) => {
    const res = await (await request.get(`/api/admin/imports/progress?seq=${seq}`)).json();
    expect(res).toMatchObject({ active: true, stage: "MATCHING", total: 100, processed: 40, note: "Comparando com o catálogo: 40 de 100" });
    await prisma.adminJob.update({ where: { seq }, data: { progressNote: null } });
    expect((await (await request.get(`/api/admin/imports/progress?seq=${seq}`)).json()).active).toBe(false);
    await prisma.adminJob.update({ where: { seq }, data: { progressNote: "Comparando com o catálogo: 40 de 100" } });
    expect((await (await request.get("/api/admin/imports/progress")).json()).active).toBe(false); // sem seq nem since
  });

  test("só administrador consulta o andamento", async ({ browser }) => {
    const anon = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: { cookies: [], origins: [] } });
    expect((await anon.request.get(`/api/admin/imports/progress?seq=${seq}`)).status()).toBeGreaterThanOrEqual(401);
    await anon.close();
  });

  test("ao analisar, a tela mostra a etapa, a barra e a frase do que está acontecendo", async ({ page }) => {
    await page.route("**/api/admin/imports/progress**", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ active: true, seq, state: "RUNNING", stage: "MATCHING", total: 100, processed: 40, note: "Comparando com o catálogo: 40 de 100" }) })
    );
    // Segura a análise por alguns segundos e responde com erro para a pessoa seguir na tela do formulário.
    await page.route("**/api/admin/imports", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "teste", field: "html" }) });
    });
    await page.goto("/admin/importacoes");
    await page.getByLabel("HTML da temporada").fill("<div>qualquer coisa</div>");
    await page.getByRole("button", { name: "Analisar" }).click();

    const box = page.getByTestId("import-progress");
    await expect(box).toBeVisible();
    await expect(page.getByTestId("import-progress-stage")).toContainText("Passo 3 de 3");
    await expect(page.getByTestId("import-progress-percent")).toHaveText("40%");
    await expect(page.getByTestId("import-progress-note")).toHaveText("Comparando com o catálogo: 40 de 100");
    await expect(box).toBeHidden({ timeout: 10_000 }); // some quando termina
  });
});

test.describe("Andamento da carga no modal Confirmar importação (admin)", () => {
  test.use({ storageState: adminState });
  let prisma: PrismaClient;
  let seq = 0;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const job = await prisma.adminJob.create({ data: { kind: "IMPORT", source: "AniDB", season: "Autumn2026", state: "RUNNING", stage: "COMMIT", total: 1, processed: 0 } });
    seq = job.seq;
    await prisma.importRecord.create({ data: { jobSeq: seq, sourceKey: "979777", titleRomaji: "Obra Modal Round79", state: "NEW" } });
  });

  test.afterAll(async () => {
    await prisma.adminJob.deleteMany({ where: { seq } });
    await prisma.$disconnect();
  });

  test("confirmar mostra a barra DENTRO do modal, não solta na página", async ({ page }) => {
    await page.route("**/api/admin/imports/progress**", (route) =>
      route.fulfill({ contentType: "application/json", body: JSON.stringify({ active: true, seq, state: "RUNNING", stage: "COMMIT", total: 10, processed: 4, note: "Aplicando ao catálogo: 4 de 10" }) })
    );
    await page.route(`**/api/admin/imports/${seq}/commit`, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await route.fulfill({ status: 409, contentType: "application/json", body: JSON.stringify({ error: "teste" }) });
    });
    await page.goto(`/admin/importacoes/${seq}`);
    await page.getByTestId("confirm-import").click();
    await page.getByTestId("confirm-import-dialog").click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByTestId("import-progress")).toBeVisible();
    await expect(dialog.getByTestId("import-progress-stage")).toContainText("Aplicando ao catálogo");
    await expect(dialog.getByTestId("import-progress-percent")).toHaveText("40%");
    await expect(dialog.getByTestId("import-progress-note")).toHaveText("Aplicando ao catálogo: 4 de 10");
    // Só existe uma barra: a do modal.
    await expect(page.getByTestId("import-progress")).toHaveCount(1);
  });
});

test.describe("Obras finalizadas em Minha Lista", () => {
  let prisma: PrismaClient;
  let userId: string;
  let animeId: string;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await prisma.anime.deleteMany({ where: { anilistId: FIN } });
    animeId = (await prisma.anime.create({ data: { userId, anilistId: FIN, titleRomaji: "Obra Terminada Round79", status: "FINISHED" } })).id;
  });

  test.afterAll(async () => {
    await prisma.anime.deleteMany({ where: { anilistId: FIN } });
    await prisma.$disconnect();
  });

  const state = () => prisma.anime.findUniqueOrThrow({ where: { id: animeId }, select: { watchState: true, waiting: true } });

  test("Finalizei e Pendente marcam, trocam entre si e desfazem ao clicar de novo", async ({ page }) => {
    await page.goto("/minha-lista");
    const done = page.getByTestId(`finished-done-${FIN}`);
    const pending = page.getByTestId(`finished-pending-${FIN}`);
    await expect(done).toBeVisible();

    await done.click();
    await expect(done).toHaveAttribute("aria-pressed", "true");
    expect(await state()).toEqual({ watchState: "FINISHED", waiting: false });

    // Pendente: ainda não terminei — vai para a espera e sai de "Finalizei".
    await pending.click();
    await expect(pending).toHaveAttribute("aria-pressed", "true");
    await expect(done).toHaveAttribute("aria-pressed", "false");
    expect(await state()).toEqual({ watchState: "UNFINISHED", waiting: true });
    await expect(page.getByTestId("group-waiting")).toContainText("Obra Terminada Round79");

    // De novo: volta ao automático.
    await pending.click();
    await expect(pending).toHaveAttribute("aria-pressed", "false");
    expect(await state()).toEqual({ watchState: null, waiting: false });
  });

  test("no perfil a obra cai em 'Terminei' ou 'Não terminei' conforme a escolha", async ({ page }) => {
    await prisma.anime.update({ where: { id: animeId }, data: { watchState: "FINISHED", waiting: false } });
    await page.goto(`/users/${userId}`);
    await page.getByTestId("tab-animes").click();
    await expect(page.getByTestId(`profile-anime-category-${FIN}`)).toHaveText("Terminei");

    await prisma.anime.update({ where: { id: animeId }, data: { watchState: "UNFINISHED", waiting: true } });
    await page.reload();
    await page.getByTestId("tab-animes").click();
    await expect(page.getByTestId(`profile-anime-category-${FIN}`)).toHaveText("Não terminei");
  });

  test("API: 'waiting' precisa ser booleano e o estado continua validado", async ({ request }) => {
    expect((await request.patch(`/api/anime/${animeId}/watch-state`, { data: { state: null, waiting: "sim" } })).status()).toBe(400);
    expect((await request.patch(`/api/anime/${animeId}/watch-state`, { data: { state: "FINISHED", waiting: false } })).status()).toBe(200);
  });
});
