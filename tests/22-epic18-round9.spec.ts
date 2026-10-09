import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures — animes dedicados só
// pra estes testes, sem interferir com outros specs.
const SERIES_A_ANILIST_ID = 900901;
const SERIES_B_ANILIST_ID = 900902;

test.describe("Epic 18 — 9ª rodada — agrupamento de temporada não permite duplicata", () => {
  let animeBId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: SERIES_A_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: SERIES_A_ANILIST_ID,
        titleRomaji: "Franquia De Teste — Parte A",
        seriesKey: "franquia-round9-a",
        seasonNumber: 1,
        genres: "",
      },
      update: { seriesKey: "franquia-round9-a", seasonNumber: 1 },
    });
    const b = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: SERIES_B_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: SERIES_B_ANILIST_ID,
        titleRomaji: "Franquia De Teste — Parte B",
        seriesKey: "franquia-round9-b",
        seasonNumber: 1,
        genres: "",
      },
      update: { seriesKey: "franquia-round9-b", seasonNumber: 1 },
    });
    animeBId = b.id;
    await prisma.$disconnect();
  });

  test("mover um anime pro mesmo seriesKey+temporada que outro já ocupa é rejeitado", async ({ request }) => {
    // B tenta entrar no mesmo agrupamento de A, na mesma temporada 1 que A
    // já ocupa — antes da correção, isso era aceito e o SeasonSwitcher
    // renderizava 2 chips "Temporada 1" idênticos.
    const res = await request.patch(`/api/anime/${animeBId}/series`, {
      data: { seriesKey: "franquia-round9-a", seasonNumber: 1 },
    });
    expect(res.status()).toBe(409);

    const check = await request.get("/api/anime");
    const data = await check.json();
    const anime = data.animes.find((a: { id: string }) => a.id === animeBId);
    expect(anime.seriesKey).toBe("franquia-round9-b");
  });

  test("mover pro mesmo seriesKey mas numa temporada diferente é aceito", async ({ request }) => {
    const res = await request.patch(`/api/anime/${animeBId}/series`, {
      data: { seriesKey: "franquia-round9-a", seasonNumber: 2 },
    });
    expect(res.ok()).toBe(true);
  });
});
