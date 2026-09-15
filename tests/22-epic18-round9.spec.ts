import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// anilistId fora da faixa usada por outras fixtures — animes dedicados só
// pra estes testes, sem interferir com outros specs.
const PROGRESS_ANILIST_ID = 900900;
const SERIES_A_ANILIST_ID = 900901;
const SERIES_B_ANILIST_ID = 900902;

test.describe("Epic 18 — 9ª rodada de auditoria de UX/UI — validação de progresso/nota", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: PROGRESS_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: PROGRESS_ANILIST_ID,
        titleRomaji: "Anime Pra Testar Validação De Progresso",
        episodes: 26,
        genres: "",
      },
      update: { episodes: 26 },
    });
    animeId = anime.id;
    await prisma.$disconnect();
  });

  // A UI (ProgressEditor.tsx) sempre manda valor já clampado — só uma
  // chamada direta à API (fora da UI) alcançava este caminho sem validação
  // nenhuma, e o valor corrompido aparecia de verdade na tela ao recarregar
  // (achado real da 9ª rodada de auditoria, Epic 18).
  test("episodeProgress negativo é rejeitado, não salvo como está", async ({ request }) => {
    const res = await request.patch(`/api/anime/${animeId}/progress`, {
      data: { episodeProgress: -5 },
    });
    expect(res.status()).toBe(400);
  });

  test("episodeProgress acima do total de episódios é rejeitado", async ({ request }) => {
    const res = await request.patch(`/api/anime/${animeId}/progress`, {
      data: { episodeProgress: 999999999 },
    });
    expect(res.status()).toBe(400);

    const check = await request.get("/api/anime");
    const data = await check.json();
    const anime = data.animes.find((a: { id: string }) => a.id === animeId);
    expect(anime.progress?.episodeProgress ?? 0).toBeLessThanOrEqual(26);
  });

  test("episodeProgress fracionário é rejeitado", async ({ request }) => {
    const res = await request.patch(`/api/anime/${animeId}/progress`, {
      data: { episodeProgress: 2.5 },
    });
    expect(res.status()).toBe(400);
  });

  test("score fora da faixa 0-10 é rejeitado", async ({ request }) => {
    const tooHigh = await request.patch(`/api/anime/${animeId}/progress`, {
      data: { score: 1000 },
    });
    expect(tooHigh.status()).toBe(400);

    const negative = await request.patch(`/api/anime/${animeId}/progress`, {
      data: { score: -3.5 },
    });
    expect(negative.status()).toBe(400);
  });

  test("valores válidos continuam sendo salvos normalmente", async ({ request }) => {
    const res = await request.patch(`/api/anime/${animeId}/progress`, {
      data: { episodeProgress: 10, score: 8 },
    });
    expect(res.ok()).toBe(true);
  });
});

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
