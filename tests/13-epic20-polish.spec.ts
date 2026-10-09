import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// anilistId alto (900400+), fora da faixa usada pelas outras fixtures —
// não colide com nenhum teste existente.
const ANIME_ANILIST_ID = 900400;

test.describe("Epic 20 — 2ª rodada de auditoria de UX/UI", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });

    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: ANIME_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: ANIME_ANILIST_ID,
        titleRomaji: "Anime Com Episódios Pra Marcar Como Assistido",
        genres: "",
        isFavorite: false,
      },
      update: { isFavorite: false },
    });
    animeId = anime.id;

    // 5 episódios numa única temporada — número já é a posição absoluta,
    // sem precisar simular reinício por temporada pra este teste.
    await prisma.episode.deleteMany({ where: { animeId } });
    await prisma.episode.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({
        animeId,
        number: i + 1,
        seasonNumber: 1,
        titleRomaji: `Episódio ${i + 1}`,
      })),
    });

    await prisma.$disconnect();
  });

  test("estrela de favorito no card da home alterna sem navegar pra outra página", async ({ page }) => {
    await page.goto("/minha-lista");
    const card = page.getByTestId(`anime-card-${animeId}`);
    await expect(card).toBeVisible();

    const star = card.getByRole("button", { name: "Adicionar aos favoritos" });
    await expect(star).toBeVisible();
    const [patchResponse] = await Promise.all([
      page.waitForResponse((res) => res.url().includes(`/api/anime/${animeId}/favorite`)),
      star.click(),
    ]);
    expect(patchResponse.ok()).toBe(true);

    // Continua na mesma página (o clique na estrela não deve disparar a
    // navegação do CardActionArea que cobre o resto do card).
    await expect(page).toHaveURL("/minha-lista");
    await expect(card.getByRole("button", { name: "Remover dos favoritos" })).toBeVisible();

    const res = await page.request.get("/api/anime");
    const data = await res.json();
    const anime = data.animes.find((a: { id: string }) => a.id === animeId);
    expect(anime.isFavorite).toBe(true);
  });

  test("Descobrir faz só 1 requisição a /api/auth/me pra tela inteira, mesmo com vários cards", async ({
    page,
  }) => {
    const authMeRequests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("/api/auth/me")) authMeRequests.push(req.url());
    });

    await page.goto("/discover");
    await page.waitForLoadState("networkidle");

    expect(authMeRequests.length).toBeLessThanOrEqual(1);
  });
});
