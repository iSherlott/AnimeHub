import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";
import { recentSeasons } from "../src/lib/exploreGroups";

// Explorar: "Em destaque" é um carrossel do que passa hoje; "Novas histórias, outros tempos" segue o gosto de quem entrou
// (obras terminadas dos gêneros da lista) ou, sem login, novidades e o que liga às últimas obras abertas; as temporadas são
// sempre 4 (a atual e as 3 anteriores, só o nome); o "acompanhar" é a estrela sobre a capa e os cartões têm a mesma altura.
const GENRE = "Round87Gosto";
const REL_GENRE = "Round87Liga";
const TODAY_SHORT = 987001;
const TODAY_LONG = 987002;
const TODAY_HIDDEN = 987003; // cache da AniList (fora da plataforma)
const TOMORROW = 987004;
const FINISHED_A = 987011;
const FINISHED_B = 987012;
const AIRING_SAME_GENRE = 987013; // mesmo gênero, mas não terminada
const OWNED = [987021, 987022, 987023];
const RECENT = 987031;
const RELATED = 987032;
const IDS = [TODAY_SHORT, TODAY_LONG, TODAY_HIDDEN, TOMORROW, FINISHED_A, FINISHED_B, AIRING_SAME_GENRE, ...OWNED, RECENT, RELATED];

const adminState = {
  cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600, httpOnly: true, secure: false, sameSite: "Lax" as const }],
  origins: [],
};
const guestState = { cookies: [], origins: [] };

test.describe.serial("Explorar — fileiras, temporadas e cartões", () => {
  let prisma: PrismaClient;
  const now = Date.now();

  async function clean() {
    const adminId = (await prisma.user.findUnique({ where: { email: TEST_ADMIN_EMAIL }, select: { id: true } }))?.id;
    if (adminId) await prisma.anime.deleteMany({ where: { userId: adminId, anilistId: { in: IDS } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: IDS } } });
    await prisma.production.deleteMany({ where: { anilistId: { in: IDS } } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: { in: IDS } } });
    await prisma.catalogEntry.deleteMany({ where: { anilistId: { in: IDS } } });
  }

  const entry = (anilistId: number, title: string, genres: string, over: Record<string, unknown> = {}) =>
    prisma.catalogEntry.create({ data: { anilistId, titleRomaji: title, genres, source: "anilist", onPlatform: true, coverImage: null, ...over } });
  const airing = (anilistId: number, title: string, at: Date) =>
    prisma.airingScheduleEntry.create({ data: { anilistId, episode: 3, airingAt: at, titleRomaji: title, genres: "Comedy" } });

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    const hour = 3600_000;
    await entry(TODAY_SHORT, "Hoje Curto Round87", "Comedy", { status: "RELEASING" });
    await entry(TODAY_LONG, "Hoje Com Um Titulo Muito Muito Muito Comprido Para Ocupar Varias Linhas Round87", "Comedy", { status: "RELEASING" });
    await entry(TODAY_HIDDEN, "Hoje Escondido Round87", "Comedy", { onPlatform: false });
    await entry(TOMORROW, "Amanha Round87", "Comedy", { status: "RELEASING" });
    await airing(TODAY_SHORT, "Hoje Curto Round87", new Date(now));
    await airing(TODAY_LONG, "Hoje Com Um Titulo Muito Muito Muito Comprido Para Ocupar Varias Linhas Round87", new Date(now));
    await airing(TODAY_HIDDEN, "Hoje Escondido Round87", new Date(now));
    await airing(TOMORROW, "Amanha Round87", new Date(now + 40 * hour));

    await entry(FINISHED_A, "Terminada Alfa Round87", GENRE, { status: "FINISHED" });
    await entry(FINISHED_B, "Terminada Beta Round87", GENRE, { status: "FINISHED" });
    await entry(AIRING_SAME_GENRE, "No Ar Mesmo Genero Round87", GENRE, { status: "RELEASING" });
    for (const [i, id] of OWNED.entries()) await entry(id, `Minha Lista Round87 ${i + 1}`, GENRE, { status: "FINISHED" });

    await entry(RECENT, "Visitada Round87", REL_GENRE, { status: "FINISHED" });
    await entry(RELATED, "Ligada Visitada Round87", REL_GENRE, { status: "FINISHED" });
    const franchise = await prisma.franchise.create({ data: { rootAnilistId: RECENT, name: "Visitada Round87" } });
    await prisma.production.create({ data: { anilistId: RECENT, franchiseId: franchise.id, titleRomaji: "Visitada Round87", seasonNumber: 1, format: "TV", genres: REL_GENRE, streamingLinksJson: "[]", fetchedAt: new Date() } });

    // O admin de teste (sem outras obras na lista) tem 3 obras do gênero: a afinidade dele é só esse gênero.
    const adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL }, select: { id: true } })).id;
    for (const [i, id] of OWNED.entries()) await prisma.anime.create({ data: { userId: adminId, anilistId: id, titleRomaji: `Minha Lista Round87 ${i + 1}`, genres: GENRE, status: "FINISHED" } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test.describe("sem login", () => {
    test.use({ storageState: guestState });

    test("hoje: só o que passa hoje e está na plataforma, com o horário do episódio de hoje", async ({ request }) => {
      const data = await (await request.get("/api/explore?tz=UTC&recent=")).json();
      const keys = data.today.map((i: { key: string }) => i.key);
      expect(keys).toContain(`anilist-${TODAY_SHORT}`);
      expect(keys).toContain(`anilist-${TODAY_LONG}`);
      expect(keys).not.toContain(`anilist-${TODAY_HIDDEN}`); // cache da AniList: fora da plataforma
      expect(keys).not.toContain(`anilist-${TOMORROW}`); // amanhã
      const short = data.today.find((i: { key: string }) => i.key === `anilist-${TODAY_SHORT}`);
      expect(short.nextEpisodeNumber).toBe(3);
      expect(new Date(short.nextEpisodeAt).getTime()).toBe(now);
      expect(data.personalized).toBe(false);
    });

    test("histórias: o que se liga às últimas obras abertas aparece, sem a própria obra visitada", async ({ request }) => {
      const data = await (await request.get(`/api/explore?tz=UTC&recent=${RECENT}`)).json();
      const keys = data.stories.map((i: { key: string }) => i.key);
      expect(keys).toContain(`anilist-${RELATED}`); // mesmo gênero da que foi aberta
      expect(keys).not.toContain(`anilist-${RECENT}`);
      expect(data.stories.length).toBeLessThanOrEqual(8);
      // sem histórico, ainda vêm novidades sorteadas
      const fresh = await (await request.get("/api/explore?tz=UTC&recent=")).json();
      expect(fresh.stories.length).toBeGreaterThan(0);
    });

    test("entradas inválidas não quebram (fuso e histórico)", async ({ request }) => {
      const res = await request.get("/api/explore?tz=Nao/Existe&recent=abc,-1,1.5,,987031");
      expect(res.status()).toBe(200);
    });

    test("abrir uma obra a guarda no navegador para as sugestões", async ({ page }) => {
      await page.goto(`/anime/${RECENT}`);
      await expect.poll(() => page.evaluate(() => window.localStorage.getItem("animehub:recent-works"))).toContain(String(RECENT));
      await page.goto("/discover");
      await expect(page.getByTestId("stories-row")).toBeVisible();
      await expect(page.getByTestId("stories-row")).toContainText("Novidades e o que combina com o que você viu");
      await expect(page.getByTestId(`explore-card-anilist-${RELATED}`)).toBeVisible();
    });

    test("Em destaque é um carrossel com o que passa hoje, e os cartões têm a mesma altura", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto("/discover");
      const row = page.getByTestId("today-row");
      await expect(row.getByTestId("carousel")).toBeVisible();
      const short = row.getByTestId(`explore-card-anilist-${TODAY_SHORT}`);
      const long = row.getByTestId(`explore-card-anilist-${TODAY_LONG}`);
      await expect(short).toBeVisible();
      const [a, b] = [await short.boundingBox(), await long.boundingBox()];
      expect(a && b && Math.abs(a.height - b.height) < 1).toBeTruthy();
      expect(a && b && Math.abs(a.width - b.width) < 1).toBeTruthy();
      await expect(row).not.toContainText("Amanha Round87");
      // O horário é o do episódio de hoje, mesmo que já tenha ido ao ar (nunca "Data não definida").
      await expect(short).toContainText(/Hoje · \d{2}:\d{2}/);
      // O cartão do carrossel tem o mesmo tamanho dos cartões da grade logo abaixo.
      const grid = page.getByTestId("stories-row").locator('[data-testid^="explore-card-"]').first();
      await expect(grid).toBeVisible();
      const g = await grid.boundingBox();
      expect(a && g && Math.abs(a.width - g.width) < 2).toBeTruthy();
      expect(a && g && Math.abs(a.height - g.height) < 2).toBeTruthy();
    });

    test("TEMPORADAS: a atual e as 3 anteriores, só com o nome", async ({ page }) => {
      await page.goto("/discover");
      const links = page.getByRole("navigation", { name: "Temporadas" }).getByRole("link");
      await expect(links).toHaveCount(4);
      const expected = recentSeasons(new Date(), 4).map((s) => ({ WINTER: "Winter", SPRING: "Spring", SUMMER: "Summer", FALL: "Autumn" })[s.season]);
      expect(await links.allTextContents()).toEqual(expected);
    });

    test("quem não entrou vê a estrela que leva ao login", async ({ page }) => {
      await page.goto("/discover");
      const star = page.getByTestId("today-row").getByTestId(`explore-card-anilist-${TODAY_SHORT}`).getByRole("link", { name: "+ Acompanhar" });
      await expect(star).toHaveAttribute("href", /\/login/);
    });
  });

  test.describe("com login", () => {
    test.use({ storageState: adminState });

    test("histórias: obras terminadas dos gêneros da lista, sem repetir o que já acompanha", async ({ request }) => {
      const data = await (await request.get("/api/explore?tz=UTC&recent=")).json();
      expect(data.personalized).toBe(true);
      const keys = data.stories.map((i: { key: string }) => i.key);
      expect(keys.slice(0, 2).sort()).toEqual([`anilist-${FINISHED_A}`, `anilist-${FINISHED_B}`]); // terminadas e do gênero, primeiro
      for (const id of OWNED) expect(keys).not.toContain(`anilist-${id}`); // já na lista
      // Do gênero, mas ainda no ar: só aparece depois das terminadas, e apenas para completar a fileira.
      const airingAt = keys.indexOf(`anilist-${AIRING_SAME_GENRE}`);
      expect(airingAt === -1 || airingAt > 1).toBe(true);
    });

    test("a estrela fica sobre a capa, acompanha sem sair da página e vira estrela cheia", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      const posted: number[] = [];
      await page.route("**/api/anime", async (route) => {
        if (route.request().method() !== "POST") return route.continue();
        const { anilistId } = route.request().postDataJSON() as { anilistId: number };
        posted.push(anilistId);
        await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ anime: { id: `fake-${anilistId}` } }) });
      });
      await page.goto("/discover");
      const card = page.getByTestId(`explore-card-anilist-${FINISHED_A}`);
      const star = card.getByTestId(`explore-follow-anilist-${FINISHED_A}`);
      await expect(star).toBeVisible();
      await expect(card.getByRole("button", { name: "+ Acompanhar" })).toHaveCount(1);
      // A estrela está no canto superior direito da capa (acima do título).
      const [cardBox, starBox, titleBox] = [await card.boundingBox(), await star.boundingBox(), await card.getByRole("link", { name: "Terminada Alfa Round87" }).last().boundingBox()];
      expect(starBox!.x + starBox!.width).toBeGreaterThan(cardBox!.x + cardBox!.width - 24);
      expect(starBox!.y).toBeLessThan(cardBox!.y + 24);
      expect(starBox!.y + starBox!.height).toBeLessThan(titleBox!.y);
      expect(starBox!.width).toBeGreaterThanOrEqual(44);

      const url = page.url();
      await star.click();
      await expect(card.getByTestId(`explore-following-anilist-${FINISHED_A}`)).toBeVisible();
      expect(page.url()).toBe(url);
      expect(posted).toEqual([FINISHED_A]);
    });
  });
});
