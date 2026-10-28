import { test, expect } from "@playwright/test";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { todayAtNoonSaoPaulo } from "./test-time";
import { TEST_USER_EMAIL } from "./test-auth";
import { animeSeasonOf } from "../src/lib/calendarOffGrid";

// Agenda semanal em colunas por dia (Figma 8:2106): cada dia é uma lista em
// ordem de horário, escala para monitores largos e nunca inventa horário.
const IDS = [962001, 962002, 962003];
const DELAYED_ID = 962010;
const OFF_GRID_IDS = [962021, 962022, 962023];
const IMG_IDS = [962031, 962032, 962033]; // miniatura do episódio, só capa, nenhuma imagem
const HOST = "https://s4.anilist.co/file/anilistcdn/media/anime";

function at(hourBRT: number, minute = 0): Date {
  const noon = todayAtNoonSaoPaulo(); // 12:00 BRT de hoje
  return new Date(noon.getTime() + ((hourBRT - 12) * 60 + minute) * 60_000);
}

test.describe("Calendário em colunas por dia", () => {
  let prisma: PrismaClient;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [...IDS, DELAYED_ID] } } });
    await prisma.airingScheduleEntry.createMany({
      data: [
        { anilistId: IDS[0], episode: 1, airingAt: at(10), titleRomaji: "Grade Manha Sozinha" },
        { anilistId: IDS[1], episode: 2, airingAt: at(20), titleRomaji: "Grade Noite Um" },
        { anilistId: IDS[2], episode: 3, airingAt: at(21), titleRomaji: "Grade Noite Dois" },
      ],
    });
  });

  test.afterAll(async () => {
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [...IDS, DELAYED_ID] } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: [DELAYED_ID, ...OFF_GRID_IDS] } } });
    await prisma.$disconnect();
  });

  async function openAll(page: import("@playwright/test").Page) {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();
    await expect(page.getByTestId("calendar-grid")).toBeVisible();
  }

  test("os lançamentos do dia ficam na mesma coluna, em ordem de horário (sem eixo de horas)", async ({ page }) => {
    await openAll(page);
    const morning = (await page.getByTestId("calendar-entry-962001-1").boundingBox())!;
    const night1 = (await page.getByTestId("calendar-entry-962002-2").boundingBox())!;
    const night2 = (await page.getByTestId("calendar-entry-962003-3").boundingBox())!;
    // Mesma coluna (mesmo x e largura) e empilhados por horário.
    expect(Math.abs(morning.x - night1.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(night1.x - night2.x)).toBeLessThanOrEqual(1);
    expect(night1.y).toBeGreaterThan(morning.y + morning.height - 2);
    expect(night2.y).toBeGreaterThan(night1.y + night1.height - 2);
    await expect(page.getByTestId("calendar-entry-962001-1")).toHaveText(/10:00[\s\S]*EP01/);
  });

  test("monitor ultrawide: a grade usa a tela toda e os itens crescem junto", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openAll(page);
    const narrow = (await page.getByTestId("calendar-entry-962001-1").boundingBox())!;
    const narrowFont = await page.getByTestId("calendar-grid").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));

    await page.setViewportSize({ width: 3440, height: 1440 });
    const wide = (await page.getByTestId("calendar-entry-962001-1").boundingBox())!;
    const wideFont = await page.getByTestId("calendar-grid").evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const gridBox = (await page.getByTestId("calendar-grid").boundingBox())!;

    expect(narrowFont).toBeCloseTo(14, 0);
    expect(wideFont).toBeGreaterThanOrEqual(21); // base cresce até 22 px
    expect(gridBox.width).toBeGreaterThan(3000); // sem teto de 1440 px
    expect(wide.width).toBeGreaterThan(narrow.width * 2); // colunas bem mais largas
    expect(wide.height).toBeGreaterThan(narrow.height * 1.4); // e itens mais altos
  });

  test("filtro Minha Lista/Todos e navegação de semana do Figma", async ({ page }) => {
    await page.goto("/calendar");
    await expect(page.getByRole("button", { name: "Semana anterior", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Próxima semana", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Hoje", exact: true })).toBeDisabled(); // já está na semana atual
    await page.getByRole("button", { name: "Próxima semana", exact: true }).click();
    await expect(page.getByRole("button", { name: "Hoje", exact: true })).toBeEnabled();
    await page.getByRole("button", { name: "Hoje", exact: true }).click();
    await expect(page.getByRole("button", { name: "Hoje", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Minha Lista", exact: true })).toHaveAttribute("aria-pressed", "true");
  });

  test("sem o 'Atrasado' (28/10): o episódio que a fonte ainda aponta como próximo fica no horário previsto, sem marca", async ({ request }) => {
    const airingAt = new Date(Date.now() - 4 * 3600_000);
    await prisma.airingScheduleEntry.create({
      data: { anilistId: DELAYED_ID, episode: 5, airingAt, titleRomaji: "Grade Atrasada" },
    });
    await prisma.catalogEntry.upsert({
      where: { anilistId: DELAYED_ID },
      create: { anilistId: DELAYED_ID, titleRomaji: "Grade Atrasada", source: "anilist", nextEpisodeNumber: 5, nextEpisodeAt: airingAt },
      update: { nextEpisodeNumber: 5, nextEpisodeAt: airingAt },
    });
    const weekStart = Math.floor((Date.now() - 2 * 86400_000) / 1000);
    const res = await request.get(`/api/calendar?weekStart=${weekStart}`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    const item = data.results.find((r: { anilistId: number }) => r.anilistId === DELAYED_ID);
    expect(item).not.toHaveProperty("delayed");
    expect(new Date(item.airingAt).getTime()).toBe(airingAt.getTime()); // continua no horário previsto
    expect(data.results.some((r: object) => "delayed" in r)).toBe(false);
  });

  test("API devolve fora da grade só o que não tem horário: dia exato, sem data e adiado", async ({ request }) => {
    const weekStartMs = Date.now() - 86400_000;
    const { season, year } = animeSeasonOf(new Date(weekStartMs + 3.5 * 86400_000));
    // Dia exato dentro da janela (e nunca dia 1, que é data parcial na AniList).
    const exact = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 2));
    while (exact.getUTCDate() === 1) exact.setUTCDate(exact.getUTCDate() + 1);
    const base = { source: "anilist", season, seasonYear: year, popularityRank: -1000 };
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: OFF_GRID_IDS } } });
    await prisma.catalogEntry.createMany({
      data: [
        { ...base, anilistId: OFF_GRID_IDS[0], titleRomaji: "Fora Dia Exato", status: "NOT_YET_RELEASED", startDate: exact },
        { ...base, anilistId: OFF_GRID_IDS[1], titleRomaji: "Fora Sem Data", status: "NOT_YET_RELEASED", startDate: null },
        { ...base, anilistId: OFF_GRID_IDS[2], titleRomaji: "Fora Adiado", status: "HIATUS", startDate: null },
      ],
    });
    const res = await request.get(`/api/calendar?weekStart=${Math.floor(weekStartMs / 1000)}`);
    const data = await res.json();
    const byId = (id: number) => data.offGrid.find((o: { anilistId: number }) => o.anilistId === id);
    expect(byId(OFF_GRID_IDS[0])).toMatchObject({ kind: "dated", startDate: exact.toISOString().slice(0, 10) });
    expect(byId(OFF_GRID_IDS[1])).toMatchObject({ kind: "undated", startDate: null });
    expect(byId(OFF_GRID_IDS[2])).toMatchObject({ kind: "postponed", startDate: null });
  });

  test("a tela não mostra mais 'Atrasado' nem 'Previsão atrasada'; os painéis fora da grade continuam, sem posição inventada", async ({ page }) => {
    const day = todayAtNoonSaoPaulo();
    const exactDay = day.toISOString().slice(0, 10);
    await page.route("**/api/calendar**", (route) =>
      route.fulfill({
        json: {
          results: [
            {
              key: "962099-6", anilistId: 962099, animeId: null, episode: 6, airingAt: new Date(day.getTime() - 3 * 3600_000).toISOString(),
              titleRomaji: "Mock Sem Confirmacao", titleEnglish: null, titleNative: null, titlePortuguese: null, coverImage: null, genres: [],
              inMyList: false, description: null, descriptionPortuguese: null, isFavorite: false,
            },
          ],
          offGrid: [
            { key: "o1", anilistId: 962101, titleRomaji: "Mock Dia Exato", titleEnglish: null, titleNative: null, kind: "dated", startDate: exactDay, episode: 1, inMyList: false },
            { key: "o2", anilistId: 962102, titleRomaji: "Mock Sem Data", titleEnglish: null, titleNative: null, kind: "undated", startDate: null, episode: null, inMyList: false },
            { key: "o3", anilistId: 962103, titleRomaji: "Mock Adiado", titleEnglish: null, titleNative: null, kind: "postponed", startDate: null, episode: null, inMyList: false },
          ],
        },
      })
    );
    await openAll(page);

    await expect(page.getByTestId("calendar-entry-962099-6")).toBeVisible();
    await expect(page.getByTestId("calendar-entry-962099-6")).not.toContainText("Atrasado");
    await expect(page.getByTestId("calendar-delayed-alert")).toHaveCount(0);
    await expect(page.getByText("Previsão atrasada")).toHaveCount(0);

    const panels = page.getByTestId("calendar-off-grid");
    await expect(panels.getByRole("heading", { name: "Sem horário definido" })).toBeVisible();
    await expect(panels).toContainText("Horário ainda não informado. Não ocupa uma posição na grade.");
    await expect(panels.getByRole("heading", { name: "Data não definida" })).toBeVisible();
    await expect(panels).toContainText("Adiado · nova data a confirmar");
    // Nenhum deles virou item da grade.
    await expect(page.getByTestId("calendar-grid").getByText("Mock Sem Data")).toHaveCount(0);
    await expect(page.getByTestId("calendar-grid").getByText("Mock Adiado")).toHaveCount(0);
  });
});

test.describe("Calendário — imagem do episódio", () => {
  let prisma: PrismaClient;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: IMG_IDS[0] } },
      create: { userId: user.id, anilistId: IMG_IDS[0], titleRomaji: "Imagem Com Episodio", genres: "" },
      update: {},
    });
    expect(anime.id).toBeTruthy();
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: IMG_IDS } } });
    await prisma.airingScheduleEntry.createMany({
      data: [
        // Episódio global (Fase 4): a imagem do episódio fica no próprio episódio.
        { anilistId: IMG_IDS[0], episode: 4, airingAt: todayAtNoonSaoPaulo(), titleRomaji: "Imagem Com Episodio", coverImage: `${HOST}/cover-a.jpg`, episodeTitle: "Ep 4", thumbnail: `${HOST}/episode-thumb.jpg` },
        { anilistId: IMG_IDS[1], episode: 2, airingAt: todayAtNoonSaoPaulo(), titleRomaji: "Imagem So Capa", coverImage: `${HOST}/cover-b.jpg` },
        { anilistId: IMG_IDS[2], episode: 1, airingAt: todayAtNoonSaoPaulo(), titleRomaji: "Imagem Nenhuma" },
      ],
    });
  });

  test.afterAll(async () => {
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: IMG_IDS } } });
    await prisma.anime.deleteMany({ where: { anilistId: IMG_IDS[0] } });
    await prisma.$disconnect();
  });

  test("cada item mostra a imagem do episódio; sem ela, a capa do anime; sem nenhuma, só o título", async ({ page, request }) => {
    const data = await (await request.get(`/api/calendar?weekStart=${Math.floor((Date.now() - 86400_000) / 1000)}`)).json();
    const by = (id: number) => data.results.find((r: { anilistId: number }) => r.anilistId === id);
    expect(by(IMG_IDS[0]).episodeImage).toBe(`${HOST}/episode-thumb.jpg`);
    expect(by(IMG_IDS[1]).episodeImage).toBeNull();

    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();
    await expect(page.getByTestId(`calendar-entry-image-${IMG_IDS[0]}-4`)).toHaveAttribute("data-image-kind", "episode");
    await expect(page.getByTestId(`calendar-entry-image-${IMG_IDS[1]}-2`)).toHaveAttribute("data-image-kind", "cover");
    await expect(page.getByTestId(`calendar-entry-image-${IMG_IDS[2]}-1`)).toHaveAttribute("data-image-kind", "none");
    // A imagem não substitui o texto: título e EP continuam no item.
    await expect(page.getByTestId(`calendar-entry-${IMG_IDS[1]}-2`)).toContainText("Imagem So Capa");
    await expect(page.getByTestId(`calendar-entry-${IMG_IDS[1]}-2`)).toContainText("EP02");
  });
});

test.describe("Calendário — 'Ao vivo' e destaque só em 'Todos'", () => {
  function item(key: string, anilistId: number, airingAt: Date, inMyList: boolean) {
    return {
      key, anilistId, animeId: inMyList ? `a${anilistId}` : null, episode: 1, airingAt: airingAt.toISOString(),
      titleRomaji: `Vivo ${key}`, titleEnglish: null, titleNative: null, titlePortuguese: null, coverImage: null, episodeImage: null, genres: [],
      inMyList, description: null, descriptionPortuguese: null, isFavorite: false, delayed: false,
    };
  }

  test.beforeEach(async ({ page }) => {
    const now = Date.now();
    await page.route("**/api/calendar**", (route) =>
      route.fulfill({
        json: {
          results: [
            item("live-1", 962051, new Date(now - 60_000), true), // no ar agora
            item("later-1", 962052, new Date(now + 40 * 60_000), true), // ainda não começou
          ],
          offGrid: [],
        },
      })
    );
  });

  test("só o que está no ar ganha o selo 'Ao vivo'; os demais ficam sem nenhuma marca", async ({ page }) => {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();
    await expect(page.getByTestId("calendar-entry-live-1")).toContainText("AO VIVO");
    await expect(page.getByTestId("calendar-entry-later-1")).not.toContainText("AO VIVO");
    await expect(page.getByTestId("calendar-entry-later-1")).not.toContainText("PRÓXIMO EPISÓDIO");
    await expect(page.getByTestId("calendar-entry-later-1")).not.toContainText("NO AR");
  });

  test("o vermelho da minha lista aparece em 'Todos' e some em 'Minha Lista' (onde tudo seria vermelho)", async ({ page }) => {
    await page.goto("/calendar");
    const entry = page.getByTestId("calendar-entry-later-1");
    await page.getByRole("button", { name: "Todos", exact: true }).click();
    await expect(entry).toHaveCSS("border-left-color", "rgb(255, 22, 79)");
    await page.getByRole("button", { name: "Minha Lista", exact: true }).click();
    await expect(entry).toBeVisible();
    await expect(entry).toHaveCSS("border-left-color", "rgba(0, 0, 0, 0)");
    await expect(entry).toHaveCSS("background-color", "rgb(16, 17, 22)");
  });
});


test.describe("Calendário — episódios em sequência no mesmo dia viram um item só", () => {
  function ep(episode: number, airingAt: Date, anilistId = 962061) {
    return {
      key: `${anilistId}-${episode}`, anilistId, animeId: null, episode, airingAt: airingAt.toISOString(),
      titleRomaji: `Maratona ${anilistId}`, titleEnglish: null, titleNative: null, titlePortuguese: null, coverImage: null, episodeImage: null, genres: [],
      inMyList: false, description: null, descriptionPortuguese: null, isFavorite: false, delayed: false,
    };
  }

  test("2 episódios seguidos aparecem 1 vez, com 'EP01–02' e o horário estendido; horários distantes continuam separados", async ({ page }) => {
    // Meio-dia de hoje no fuso do navegador: longe da virada do dia.
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    const at = (min: number) => new Date(noon.getTime() + min * 60_000);
    await page.route("**/api/calendar**", (route) =>
      route.fulfill({ json: { results: [ep(1, at(0)), ep(2, at(30)), ep(3, at(8 * 60)), ep(1, at(10), 962062)], offGrid: [] } })
    );
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Todos", exact: true }).click();

    const merged = page.getByTestId("calendar-entry-962061-1");
    await expect(merged).toContainText("EP01–02");
    await expect(merged).toContainText("12:00 – 13:00");
    await expect(page.getByTestId("calendar-entry-962061-2")).toHaveCount(0);
    // Mesma obra bem depois no dia: outro item. Outra obra no meio: não é fundida.
    await expect(page.getByTestId("calendar-entry-962061-3")).toContainText("EP03");
    await expect(page.getByTestId("calendar-entry-962062-1")).toBeVisible();
  });
});
