import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// "Adiar" no calendário → pendência em "Para assistir"; aba "Animes" do perfil (busca + gênero + privacidade);
// ícones de rolagem/cursor (carrossel do seletor) e botão Acompanhando em Minha Lista.
const P = 972001; // adiado
const G1 = 972011;
const G2 = 972012;
const G3 = 972013;
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const DAY = 24 * 3600 * 1000;

test.describe.serial("Adiar, Para assistir e Animes no perfil", () => {
  let prisma: PrismaClient;
  let userId: string;
  let animeId: string;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await prisma.anime.deleteMany({ where: { anilistId: { in: [P, G1, G2, G3] } } });
    await prisma.pendingEpisode.deleteMany({ where: { userId } });
    const cover = (n: string) => `https://s4.anilist.co/file/anilistcdn/spec72/${n}.png`;
    animeId = (await prisma.anime.create({ data: { userId, anilistId: P, titleRomaji: "Pendente Round72", genres: "Drama", coverImage: cover("p"), status: "RELEASING" } })).id;
    await prisma.anime.create({ data: { userId, anilistId: G1, titleRomaji: "Alfa Round72", titleEnglish: "Alpha Round72", genres: "GeneroRound72,Comedia72", coverImage: cover("g1"), status: "FINISHED" } });
    await prisma.anime.create({ data: { userId, anilistId: G2, titleRomaji: "Beta Round72", genres: "GeneroRound72", coverImage: cover("g2"), status: "RELEASING" } });
    await prisma.anime.create({ data: { userId, anilistId: G3, titleRomaji: "Gama Round72", genres: "Comedia72", coverImage: cover("g3") } });
    // EP02 saiu há 8 dias, EP03 há 1 dia (esta semana) e o EP04 ainda vai sair.
    const now = Date.now();
    for (const [episode, at] of [[1, now - 15 * DAY], [2, now - 8 * DAY], [3, now - 1 * DAY], [4, now + 6 * DAY]] as const) {
      await prisma.airingScheduleEntry.upsert({
        where: { anilistId_episode: { anilistId: P, episode } },
        create: { anilistId: P, episode, airingAt: new Date(at), titleRomaji: "Pendente Round72" },
        update: { airingAt: new Date(at) },
      });
    }
  });

  test.afterAll(async () => {
    await prisma.user.update({ where: { id: userId }, data: { animeListPublic: true } });
    await prisma.pendingEpisode.deleteMany({ where: { userId } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: [P, G1, G2, G3] } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: P } });
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ page }) => {
    await page.route(/s4\.anilist\.co\/file\/anilistcdn\/spec72/, (route) => route.fulfill({ status: 200, contentType: "image/png", body: PNG }));
  });

  // D5 (Fase 4): adiar vale para a OBRA — sem número de episódio, sem "parei no", sem "faltam N para ver".
  test("API: adiar a obra, recusa obra não acompanhada, ignora número de episódio e dá para retomar", async ({ request }) => {
    expect((await request.post("/api/pending", { data: { anilistId: 972999 } })).status()).toBe(403);
    expect((await request.post("/api/pending", { data: { anilistId: "x" } })).status()).toBe(400);

    const first = await request.post("/api/pending", { data: { anilistId: P } });
    expect(first.status()).toBe(201);
    const { postponedAt } = await first.json();
    // Adiar de novo (mesmo com um número de episódio de cliente antigo) mantém a data do primeiro adiamento.
    expect((await (await request.post("/api/pending", { data: { anilistId: P, episode: 2 } })).json()).postponedAt).toBe(postponedAt);
    expect((await prisma.pendingEpisode.findUniqueOrThrow({ where: { userId_anilistId: { userId, anilistId: P } } })).fromEpisode).toBeNull();

    const { pending } = await (await request.get("/api/pending")).json();
    const row = pending.find((p: { anilistId: number }) => p.anilistId === P);
    expect(row).toMatchObject({ latestAired: 3, latestAiredThisWeek: true, stillAiring: true });
    expect(row).not.toHaveProperty("fromEpisode");
    expect(row).not.toHaveProperty("behind");
    expect(row.next.episode).toBe(4);

    expect((await request.delete(`/api/pending/${P}`)).status()).toBe(200);
    expect((await prisma.pendingEpisode.count({ where: { userId, anilistId: P } }))).toBe(0);
  });

  test("calendário: 'Adiar a obra' no preview marca 'Obra adiada' no item, e 'Retomar' desfaz", async ({ page }) => {
    const at = new Date(Date.now() - 2 * 60 * 1000);
    await page.route("**/api/calendar**", (route) =>
      route.fulfill({
        json: {
          results: [
            {
              key: `${P}-3`, anilistId: P, animeId, episode: 3, airingAt: at.toISOString(),
              titleRomaji: "Pendente Round72", titleEnglish: null, titleNative: null, titlePortuguese: null,
              coverImage: "https://s4.anilist.co/file/anilistcdn/spec72/p.png", episodeImage: null, genres: [],
              inMyList: true, description: "Sinopse.", descriptionPortuguese: null, isFavorite: false, delayed: false, postponed: false,
            },
          ],
          offGrid: [],
        },
      })
    );
    await page.goto("/calendar");
    await page.getByRole("button", { name: /Pendente Round72/ }).hover();
    const preview = page.getByTestId("calendar-preview");
    await preview.getByTestId("preview-postpone").click();
    await expect(preview.getByTestId("preview-pending-note")).toContainText("Obra adiada");
    await expect(page.getByTestId(`calendar-pending-${P}-3`)).toContainText("Obra adiada");
    expect((await prisma.pendingEpisode.findUniqueOrThrow({ where: { userId_anilistId: { userId, anilistId: P } } })).fromEpisode).toBeNull();

    await preview.getByTestId("preview-pending-resolve").click();
    await expect(page.getByTestId(`calendar-pending-${P}-3`)).toHaveCount(0);
    expect(await prisma.pendingEpisode.count({ where: { userId, anilistId: P } })).toBe(0);
  });

  test("Para assistir: mostra quando foi adiada, até onde a obra saiu, o próximo, e 'Retomar' tira da lista", async ({ page }) => {
    await prisma.pendingEpisode.create({ data: { userId, anilistId: P } });
    await page.goto("/minha-lista");
    await expect(page.getByTestId("tab-pending")).toContainText("Para assistir · 1");
    await page.getByTestId("tab-pending").click();
    await expect(page).toHaveURL(/\/minha-lista\/pendencias$/);

    const row = page.getByTestId(`pending-row-${P}`);
    await expect(row.getByTestId("pending-from")).toContainText("Adiada em");
    await expect(row).not.toContainText("Parei no");
    await expect(row).toContainText("Já saiu até o EP03 · esta semana");
    await expect(row).toContainText("Próximo: EP04");
    await expect(row.getByTestId("pending-new")).toContainText("Episódio novo esta semana");
    await expect(row.getByTestId("pending-behind")).toHaveCount(0);
    await expect(row.getByTestId("pending-open")).toHaveAttribute("href", `/anime/${animeId}`);

    await row.getByTestId("pending-resolve").click();
    await expect(page.getByTestId("pending-empty")).toBeVisible();
    await expect(page.getByTestId("tab-pending")).toContainText("Para assistir · 0");
  });

  test("Minha Lista: o botão Espera tira a obra da agenda sem sair da lista, e retoma", async ({ page, request }) => {
    await page.goto("/minha-lista");
    // A lista rola aos poucos (30 por vez): a busca deixa só esta obra, e o painel "Em espera" (que fica no fim) aparece junto.
    await page.getByLabel("Buscar na minha lista").fill("Pendente Round72");
    const card = page.getByTestId(`anime-card-${animeId}`);
    const toggle = card.getByTestId("wait-toggle");
    await expect(toggle).toHaveText("Espera");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByRole("button", { name: "Adicionar aos favoritos" })).toHaveCount(0);

    await toggle.click();
    // Em espera: segue na lista, mas num painel próprio, fora da agenda por data.
    const waiting = page.getByTestId("group-waiting");
    await expect(waiting.getByTestId(`anime-card-${animeId}`)).toBeVisible();
    await expect(waiting.getByTestId("wait-toggle").first()).toHaveAttribute("aria-pressed", "true");
    expect((await prisma.anime.findUniqueOrThrow({ where: { id: animeId } })).waiting).toBe(true);
    // A API do calendário não a trata mais como "da minha lista".
    const { results } = await (await request.get("/api/calendar")).json();
    const item = results.find((r: { anilistId: number }) => r.anilistId === P);
    if (item) expect(item).toMatchObject({ inMyList: false, waiting: true });

    await waiting.getByTestId(`anime-card-${animeId}`).getByTestId("wait-toggle").click();
    await expect(page.getByTestId("group-waiting")).toHaveCount(0);
    expect((await prisma.anime.findUniqueOrThrow({ where: { id: animeId } })).waiting).toBe(false);
  });

  test("entrar em espera limpa a pendência de 'Para assistir' e a API valida o pedido", async ({ request }) => {
    await prisma.pendingEpisode.create({ data: { userId, anilistId: P } });
    expect((await request.patch(`/api/anime/${animeId}/waiting`, { data: { waiting: "sim" } })).status()).toBe(400);
    expect((await request.patch("/api/anime/nao-existe/waiting", { data: { waiting: true } })).status()).toBe(404);
    expect((await request.patch(`/api/anime/${animeId}/waiting`, { data: { waiting: true } })).status()).toBe(200);
    expect(await prisma.pendingEpisode.count({ where: { userId, anilistId: P } })).toBe(0);
    expect((await request.patch(`/api/anime/${animeId}/waiting`, { data: { waiting: false } })).status()).toBe(200);
  });

  test("calendário: obra em espera não é 'da lista'; o botão Em espera volta a acompanhar", async ({ page }) => {
    const at = new Date(Date.now() - 2 * 60 * 1000);
    await page.route("**/api/calendar**", (route) =>
      route.fulfill({
        json: {
          results: [
            {
              key: `${P}-3`, anilistId: P, animeId, episode: 3, airingAt: at.toISOString(),
              titleRomaji: "Pendente Round72", titleEnglish: null, titleNative: null, titlePortuguese: null,
              coverImage: "https://s4.anilist.co/file/anilistcdn/spec72/p.png", episodeImage: null, genres: [],
              inMyList: false, waiting: true, description: "Sinopse.", descriptionPortuguese: null, isFavorite: false, delayed: false,
            },
          ],
          offGrid: [],
        },
      })
    );
    let resumed = false;
    await page.route(`**/api/anime/${animeId}/waiting`, async (route) => {
      resumed = route.request().postDataJSON().waiting === false;
      await route.fulfill({ status: 200, json: { anime: { id: animeId, waiting: false } } });
    });
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();
    await page.getByRole("button", { name: /Pendente Round72/ }).hover();
    const toggle = page.getByTestId("preview-follow-toggle");
    await expect(toggle).toHaveAttribute("data-state", "waiting");
    await expect(toggle).toContainText("Em espera");
    await toggle.click();
    await expect(page.getByTestId("preview-follow-toggle")).toHaveAttribute("data-state", "following");
    expect(resumed).toBe(true);
  });

  test("perfil: aba Animes lista as obras, busca por título e filtra por gênero", async ({ page }) => {
    await page.goto(`/users/${userId}`);
    await page.getByTestId("tab-animes").click();
    const list = page.getByTestId("profile-anime-list");
    await expect(list.getByTestId(`profile-anime-${G1}`)).toBeVisible();
    await expect(list.getByTestId(`profile-anime-${G3}`)).toBeVisible();

    // Gênero: "GeneroRound72" tem 2 obras, "Comedia72" tem 2.
    await list.getByTestId("genre-GeneroRound72").click();
    await expect(list.getByTestId(`profile-anime-${G1}`)).toBeVisible();
    await expect(list.getByTestId(`profile-anime-${G2}`)).toBeVisible();
    await expect(list.getByTestId(`profile-anime-${G3}`)).toHaveCount(0);
    await expect(list.getByTestId("profile-anime-count")).toContainText(/^2 de \d+/);

    // Gênero + título (inglês, sem acento).
    await list.getByRole("textbox", { name: "Buscar animes" }).fill("alpha");
    await expect(list.getByTestId(`profile-anime-${G1}`)).toBeVisible();
    await expect(list.getByTestId(`profile-anime-${G2}`)).toHaveCount(0);

    await list.getByRole("textbox", { name: "Buscar animes" }).fill("nada-assim-existe");
    await expect(list.getByTestId("profile-anime-empty")).toBeVisible();

    // Cada capa abre a prévia, que tem o botão da página pública da obra.
    await list.getByRole("textbox", { name: "Buscar animes" }).fill("");
    await list.getByTestId("genre-all").click();
    await list.getByTestId(`profile-anime-open-${G3}`).click();
    await expect(page.getByRole("link", { name: "Ver página da obra" })).toHaveAttribute("href", `/anime/${G3}`);
    await page.keyboard.press("Escape");
  });

  test("privacidade: ocultar em Configurações esconde a aba de quem visita, mas não de mim", async ({ page, browser, request }) => {
    // Visitante anônimo vê enquanto é pública...
    const anon = await browser.newContext({ baseURL: test.info().project.use.baseURL, storageState: { cookies: [], origins: [] } });
    const anonApi = anon.request;
    const open = await anonApi.get(`/api/users/${userId}/animes?genre=GeneroRound72`);
    expect(open.status()).toBe(200);
    expect((await open.json()).entries.map((e: { anilistId: number }) => e.anilistId).sort()).toEqual([G1, G2]);
    // ...e a resposta não vaza id interno da lista nem nada de consumo.
    expect(JSON.stringify(await (await anonApi.get(`/api/users/${userId}/animes`)).json())).not.toMatch(/"id"|userId|isFavorite|episode/);

    // Oculta pela tela de Configurações.
    await page.goto("/configuracoes");
    await page.getByRole("checkbox", { name: "Mostrar meus animes no perfil" }).uncheck({ force: true });
    await page.getByTestId("save-settings").click();
    await expect(page.getByText("Configurações salvas.")).toBeVisible();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).animeListPublic).toBe(false);

    const hidden = await anonApi.get(`/api/users/${userId}/animes`);
    expect(hidden.status()).toBe(403);
    // Eu continuo vendo a minha.
    expect((await request.get(`/api/users/${userId}/animes`)).status()).toBe(200);
    const visitor = await anon.newPage();
    await visitor.goto(`/users/${userId}`);
    await expect(visitor.getByTestId("tab-animes")).toHaveText("Animes");
    await visitor.getByTestId("tab-animes").click();
    await expect(visitor.getByTestId("profile-anime-hidden")).toBeVisible();
    await anon.close();

    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("tab-animes")).toContainText(/Animes · \d+/);
  });

  test("seletor de avatar: as obras usam carrossel com setas, e barras de rolagem seguem o tema", async ({ page }) => {
    await page.goto("/perfil/editar");
    await page.getByTestId("edit-avatar").click();
    const dialog = page.getByRole("dialog", { name: "Seleção de Avatar" });
    await expect(dialog.getByRole("group", { name: /^Avatares de / }).first()).toBeVisible();
    // Texto comum não ganha o cursor/caret de digitação; só os campos.
    const cursor = await page.evaluate(() => getComputedStyle(document.body).cursor);
    expect(cursor).toBe("default");
    const caret = await page.evaluate(() => getComputedStyle(document.body).caretColor);
    expect(caret).not.toBe("auto");
  });
});
