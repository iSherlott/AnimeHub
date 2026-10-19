import { createServer, type Server } from "node:http";
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_SESSION_TOKEN } from "./test-auth";
import { todayAtNoonSaoPaulo } from "./test-time";

// Preview do calendário (rolagem e "Acompanhar" direto), imagens de episódio
// (job diário 00:00 + botão do Admin) e "Onde assistir" na página da obra.
const HOVER_ID = 964203;
const MAPPED_ID = 964201;
const UNMAPPED_ID = 964202;
const THUMB = "https://s4.anilist.co/file/anilistcdn/media/anime/ep2-thumb.jpg";
const WATCH_ID = 964301;
const NO_WATCH_ID = 964302;

const adminState = {
  cookies: [
    { name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const },
  ],
  origins: [],
};

test.describe("Calendário — preview ao passar o mouse", () => {
  let prisma: PrismaClient;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: HOVER_ID } });
    await prisma.airingScheduleEntry.create({ data: { anilistId: HOVER_ID, episode: 1, airingAt: todayAtNoonSaoPaulo(), titleRomaji: "Hover Follow Alvo" } });
  });

  test.afterAll(async () => {
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: HOVER_ID } });
    await prisma.$disconnect();
  });

  test("com o preview aberto a página continua rolando com a roda do mouse", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 420 });
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();
    const entry = page.getByTestId(`calendar-entry-${HOVER_ID}-1`);
    await entry.scrollIntoViewIfNeeded();
    await entry.hover();
    await expect(page.getByTestId("calendar-preview")).toBeVisible();
    await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");

    const before = await page.evaluate(() => window.scrollY);
    // Se o item já ficou no fim da página (depende de quantas obras o calendário tem), a roda tem de rolar para cima.
    const room = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight - window.scrollY);
    const delta = room > 50 ? 400 : -400;
    await expect
      .poll(async () => {
        await page.mouse.wheel(0, delta);
        return page.evaluate(() => window.scrollY);
      })
      .not.toBe(before);
  });

  test("'+ Acompanhar' no preview adiciona direto à lista, sem abrir a página da obra", async ({ page }) => {
    let posted: unknown = null;
    await page.route("**/api/anime", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      posted = route.request().postDataJSON();
      await route.fulfill({ status: 201, json: { anime: { id: "mock-follow-id" } } });
    });
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();
    const entry = page.getByTestId(`calendar-entry-${HOVER_ID}-1`);
    await entry.hover();
    await page.getByTestId("preview-follow").click();

    await expect(page.getByTestId("preview-following")).toHaveAttribute("href", "/anime/mock-follow-id");
    expect(posted).toMatchObject({ anilistId: HOVER_ID });
    await expect(page).toHaveURL(/\/calendar$/); // não navegou
    // O item da grade já aparece como da lista (barra de acento), sem selo de "novo episódio".
    await expect(entry).toHaveCSS("border-left-color", "rgb(255, 22, 79)");
  });

  test("erro ao acompanhar mostra a mensagem e mantém o botão para tentar de novo", async ({ page }) => {
    await page.route("**/api/anime", async (route) => {
      if (route.request().method() !== "POST") return route.continue();
      await route.fulfill({ status: 502, json: { error: "Falha ao buscar dados do anime" } });
    });
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();
    await page.getByTestId(`calendar-entry-${HOVER_ID}-1`).hover();
    await page.getByTestId("preview-follow").click();
    await expect(page.getByRole("alert").filter({ hasText: "Falha ao buscar dados do anime" })).toBeVisible();
    await expect(page.getByTestId("preview-follow")).toBeEnabled();
  });
});

test.describe("Imagens dos episódios — job diário e botão do Admin", () => {
  test.use({ storageState: adminState });
  test.describe.configure({ mode: "serial" });

  let prisma: PrismaClient;
  let kitsu: Server;
  const mappingRequests: string[] = [];

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    // Kitsu falsa (o servidor de teste aponta para ela via EPISODE_IMAGES_KITSU_BASE_URL).
    kitsu = createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://localhost");
      res.setHeader("Content-Type", "application/vnd.api+json");
      if (url.pathname === "/api/edge/mappings") {
        const id = url.searchParams.get("filter[externalId]") ?? "";
        mappingRequests.push(id);
        res.end(JSON.stringify({ data: id === String(MAPPED_ID) ? [{ relationships: { item: { data: { id: "5001", type: "anime" } } } }] : [] }));
        return;
      }
      if (url.pathname === "/api/edge/anime/5001/episodes") {
        const number = Number(url.searchParams.get("filter[number]"));
        res.end(JSON.stringify({ data: [{ attributes: { number, thumbnail: { original: THUMB } } }] }));
        return;
      }
      res.statusCode = 404;
      res.end("{}");
    });
    await new Promise<void>((resolve) => kitsu.listen(3199, resolve));

    await prisma.episodeImageRun.deleteMany({});
    await prisma.episodeImage.deleteMany({ where: { anilistId: { in: [MAPPED_ID, UNMAPPED_ID] } } });
    await prisma.episodeImageSource.deleteMany({ where: { anilistId: { in: [MAPPED_ID, UNMAPPED_ID] } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [MAPPED_ID, UNMAPPED_ID] } } });
    await prisma.airingScheduleEntry.createMany({
      data: [
        { anilistId: MAPPED_ID, episode: 2, airingAt: todayAtNoonSaoPaulo(), titleRomaji: "Imagem Job Mapeado", coverImage: "https://s4.anilist.co/file/anilistcdn/media/anime/cover-job.jpg" },
        { anilistId: UNMAPPED_ID, episode: 1, airingAt: todayAtNoonSaoPaulo(), titleRomaji: "Imagem Job Sem Mapa" },
      ],
    });
  });

  test.afterAll(async () => {
    await new Promise<void>((resolve) => kitsu.close(() => resolve()));
    await prisma.episodeImageRun.deleteMany({});
    await prisma.episodeImage.deleteMany({ where: { anilistId: { in: [MAPPED_ID, UNMAPPED_ID] } } });
    await prisma.episodeImageSource.deleteMany({ where: { anilistId: { in: [MAPPED_ID, UNMAPPED_ID] } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [MAPPED_ID, UNMAPPED_ID] } } });
    await prisma.$disconnect();
  });

  test("Scrapers mostra a busca de imagens com a agenda das 00:00 e o botão 'Executar agora'", async ({ page }) => {
    await page.goto("/admin/scrapers");
    const card = page.getByRole("region", { name: "Imagens dos episódios · Kitsu" });
    await expect(card).toContainText("todo dia às 00:00 (America/Sao_Paulo)");
    await expect(card).toContainText("sem execução ainda");
    await expect(page.getByTestId("run-episode-images")).toBeEnabled();
    // Só este serviço pode ser executado à mão — nada de coleta de sites de terceiros (D-30).
    await expect(page.getByRole("button", { name: /Executar/ })).toHaveCount(1);
  });

  test("forçar pelo painel busca as imagens do mapeamento oficial e o calendário passa a exibi-las", async ({ page, request }) => {
    const res = await request.post("/api/admin/episode-images/run");
    expect(res.status()).toBe(202);

    // Espera a execução existir E terminar (antes de existir, o status ainda é indefinido).
    await expect
      .poll(async () => (await prisma.episodeImageRun.findFirst({ orderBy: { startedAt: "desc" } }))?.status ?? "NONE", { timeout: 60_000, intervals: [500] })
      .toMatch(/^(OK|PARTIAL|ERROR)$/);
    const run = await prisma.episodeImageRun.findFirstOrThrow({ orderBy: { startedAt: "desc" } });
    expect(run.trigger).toBe("manual");
    expect(run.adminName).toBeTruthy();
    expect(run.found).toBeGreaterThanOrEqual(1);
    expect(run.failed).toBe(0);
    expect(mappingRequests).toContain(String(MAPPED_ID));

    const stored = await prisma.episodeImage.findUniqueOrThrow({ where: { anilistId_episode: { anilistId: MAPPED_ID, episode: 2 } } });
    expect(stored.thumbnail).toBe(THUMB);
    expect(await prisma.episodeImage.count({ where: { anilistId: UNMAPPED_ID } })).toBe(0); // sem mapeamento: continua a capa

    const data = await (await request.get(`/api/calendar?weekStart=${Math.floor((Date.now() - 86400_000) / 1000)}`)).json();
    const by = (id: number) => data.results.find((r: { anilistId: number }) => r.anilistId === id);
    expect(by(MAPPED_ID).episodeImage).toBe(THUMB);
    expect(by(UNMAPPED_ID).episodeImage).toBeNull();

    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();
    await expect(page.getByTestId(`calendar-entry-image-${MAPPED_ID}-2`)).toHaveAttribute("data-image-kind", "episode");

    await page.goto("/admin/scrapers");
    await expect(page.getByRole("region", { name: "Imagens dos episódios · Kitsu" })).toContainText("imagens guardadas".replace("imagens guardadas", "Imagens guardadas"));
    await expect(page.getByTestId("admin-scrapers-table")).toContainText("Imagens dos episódios · Kitsu");
  });

  test("uma execução em andamento recusa outra (409)", async ({ request }) => {
    const running = await prisma.episodeImageRun.create({ data: { status: "RUNNING", trigger: "manual" } });
    const res = await request.post("/api/admin/episode-images/run");
    expect(res.status()).toBe(409);
    await prisma.episodeImageRun.delete({ where: { id: running.id } });
  });

  test("só administrador força a busca", async ({ playwright, baseURL }) => {
    const member = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] }, extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_SESSION_TOKEN}` } });
    const res = await member.post("/api/admin/episode-images/run");
    expect(res.status()).toBe(403); // usuário comum
    const guest = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await guest.post("/api/admin/episode-images/run")).status()).toBe(401);
    await guest.dispose();
    await member.dispose();
  });
});

test.describe("Onde assistir na página da obra", () => {
  let prisma: PrismaClient;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const franchise = await prisma.franchise.upsert({ where: { rootAnilistId: WATCH_ID }, create: { rootAnilistId: WATCH_ID, name: "Onde Assistir Teste" }, update: {} });
    const franchise2 = await prisma.franchise.upsert({ where: { rootAnilistId: NO_WATCH_ID }, create: { rootAnilistId: NO_WATCH_ID, name: "Sem Links Teste" }, update: {} });
    await prisma.production.deleteMany({ where: { anilistId: { in: [WATCH_ID, NO_WATCH_ID] } } });
    await prisma.production.create({
      data: {
        anilistId: WATCH_ID,
        franchiseId: franchise.id,
        titleRomaji: "Onde Assistir Teste",
        streamingLinksJson: JSON.stringify([
          { site: "Crunchyroll", url: "https://www.crunchyroll.com/series/teste" },
          { site: "Netflix", url: "https://www.netflix.com/title/123" },
        ]),
      },
    });
    await prisma.production.create({ data: { anilistId: NO_WATCH_ID, franchiseId: franchise2.id, titleRomaji: "Sem Links Teste", streamingLinksJson: "[]" } });
  });

  test.afterAll(async () => {
    await prisma.production.deleteMany({ where: { anilistId: { in: [WATCH_ID, NO_WATCH_ID] } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: [WATCH_ID, NO_WATCH_ID] } } });
    await prisma.$disconnect();
  });

  test("a descrição lista os sites para assistir, abrindo em outra aba sem referenciador", async ({ page }) => {
    await page.goto(`/obra/${WATCH_ID}`);
    const watch = page.getByTestId("watch-links");
    await expect(watch.getByRole("link", { name: /Crunchyroll/ })).toHaveAttribute("href", "https://www.crunchyroll.com/series/teste");
    await expect(watch.getByRole("link", { name: /Netflix/ })).toHaveAttribute("target", "_blank");
    await expect(watch.getByRole("link", { name: /Netflix/ })).toHaveAttribute("rel", /noopener/);
    await expect(page.getByRole("heading", { name: "Onde assistir", exact: true })).toBeVisible();
  });

  test("sem links informados pela fonte, diz isso em vez de ficar em branco", async ({ page }) => {
    await page.goto(`/obra/${NO_WATCH_ID}`);
    await expect(page.getByTestId("watch-links-empty")).toContainText("Nenhum site de streaming informado");
  });
});
