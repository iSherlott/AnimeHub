import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";
import { currentSeason } from "../src/lib/anilist";
import { todayAtNoonSaoPaulo } from "./test-time";

// Só o que está na plataforma aparece (busca, Descobrir, calendário, recomendações, página da obra, acompanhar);
// cache da AniList (onPlatform=false) e conteúdo adulto (hentai) nunca.
const IN = 975001; // na plataforma
const CACHE = 975002; // só cache da AniList
const ADULT = 975003; // hentai, mesmo marcado na plataforma
const SOURCE = 975100; // obra que a pessoa acompanha, que recomenda as outras
const ids = [IN, CACHE, ADULT, SOURCE];

test.describe.serial("Plataforma: cache fora, hentai fora", () => {
  let prisma: PrismaClient;
  let userId: string;

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    const { season, seasonYear } = currentSeason();
    await prisma.anime.deleteMany({ where: { anilistId: SOURCE } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: ids } } });
    await prisma.catalogEntry.deleteMany({ where: { anilistId: { in: ids } } });
    const base = { season, seasonYear, source: "anilist" };
    await prisma.catalogEntry.createMany({
      data: [
        { anilistId: IN, titleRomaji: "Zebra Plataforma Round75", genres: "Comedy", onPlatform: true, ...base },
        { anilistId: CACHE, titleRomaji: "Zebra Cache Round75", genres: "Comedy", onPlatform: false, ...base },
        { anilistId: ADULT, titleRomaji: "Zebra Adulto Round75", genres: "Comedy,Hentai", onPlatform: true, ...base },
      ],
    });
    const at = todayAtNoonSaoPaulo();
    await prisma.airingScheduleEntry.createMany({
      data: [IN, CACHE, ADULT].map((anilistId, i) => ({ anilistId, episode: 1, airingAt: at, titleRomaji: `Zebra ${["Plataforma", "Cache", "Adulto"][i]} Round75`, genres: anilistId === ADULT ? "Comedy,Hentai" : "Comedy" })),
    });
    await prisma.anime.create({
      data: {
        userId,
        anilistId: SOURCE,
        titleRomaji: "Origem Round75",
        genres: "Comedy",
        recommendationsJson: JSON.stringify([IN, CACHE, ADULT, 999998].map((anilistId) => ({ anilistId, titleRomaji: `Rec ${anilistId}`, titleEnglish: null, coverImage: null }))),
      },
    });
  });

  test.afterAll(async () => {
    await prisma.anime.deleteMany({ where: { anilistId: SOURCE } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: ids } } });
    await prisma.catalogEntry.deleteMany({ where: { anilistId: { in: ids } } });
    await prisma.$disconnect();
  });

  test("busca e catálogo mostram só a obra da plataforma (nem o cache, nem o hentai)", async ({ request }) => {
    const search = await (await request.get("/api/anilist/search?q=Zebra")).json();
    expect(search.results.map((r: { anilistId: number }) => r.anilistId)).toEqual([IN]);
    const catalog = await (await request.get("/api/catalog")).json();
    const found = catalog.results.filter((r: { anilistId: number }) => ids.includes(r.anilistId)).map((r: { anilistId: number }) => r.anilistId);
    expect(found).toEqual([IN]);
    const season = currentSeason();
    const list = await (await request.get(`/api/anilist/season?season=${season.season}&year=${season.seasonYear}`)).json();
    const inSeason = list.results.filter((r: { anilistId: number }) => ids.includes(r.anilistId)).map((r: { anilistId: number }) => r.anilistId);
    expect(inSeason).toEqual([IN]);
  });

  test("calendário: só a obra da plataforma; cache e hentai ficam de fora", async ({ request }) => {
    const { results } = await (await request.get("/api/calendar")).json();
    const shown = results.filter((r: { anilistId: number }) => ids.includes(r.anilistId)).map((r: { anilistId: number }) => r.anilistId);
    expect(shown).toEqual([IN]);
  });

  test("não dá para acompanhar nem abrir a página de obra fora da plataforma", async ({ request, page }) => {
    const cache = await request.post("/api/anime", { data: { anilistId: CACHE } });
    expect(cache.status()).toBe(403);
    expect((await cache.json()).error).toContain("não faz parte da plataforma");
    expect((await page.goto(`/obra/${CACHE}`))?.status()).toBe(404);
    expect((await page.goto(`/obra/${ADULT}`))?.status()).toBe(404);
  });

  test("recomendações (API e página do anime) apontam só para o que está na plataforma", async ({ request, page }) => {
    const list = (await (await request.get("/api/feed/recommendations")).json()).animes as Array<{ anilistId: number; becauseTitle: string | null }>;
    const mine = list.filter((r) => ids.includes(r.anilistId) || r.anilistId === 999998);
    expect(mine.map((r) => r.anilistId)).toEqual([IN]);
    expect(mine[0].becauseTitle).toBe("Origem Round75");

    const sourceId = (await prisma.anime.findFirstOrThrow({ where: { userId, anilistId: SOURCE } })).id;
    await page.goto(`/anime/${sourceId}`);
    await expect(page.locator(`a[href="/anime/${IN}"]`)).toHaveCount(1);
    for (const hidden of [CACHE, ADULT, 999998]) await expect(page.locator(`a[href="/obra/${hidden}"]`)).toHaveCount(0);
  });
});
