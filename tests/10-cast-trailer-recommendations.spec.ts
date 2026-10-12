import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// anilistId alto (900100+), fora da faixa usada pelas fixtures normais —
// não faz nenhuma chamada real à AniList, só popula os campos que a página
// de detalhe já espera ler (trailerId/trailerSite/castJson/recommendationsJson).
const ANIME_ANILIST_ID = 900100;
const RECOMMENDED_INTERNAL_ANILIST_ID = 900101; // já está na lista do usuário
const RECOMMENDED_EXTERNAL_ANILIST_ID = 900102; // não está na lista do usuário, mas está na plataforma
const RECOMMENDED_HIDDEN_ANILIST_ID = 900103; // só cache da AniList: não aparece

test.describe("Trailer, elenco e recomendações (Epic 14)", () => {
  let animeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });

    const internalRecommended = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: RECOMMENDED_INTERNAL_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: RECOMMENDED_INTERNAL_ANILIST_ID,
        titleRomaji: "Anime Recomendado Já Na Lista",
        genres: "",
      },
      update: {},
    });

    const anime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: ANIME_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: ANIME_ANILIST_ID,
        titleRomaji: "Anime Com Trailer, Elenco e Recomendações",
        genres: "",
        trailerId: "dQw4w9WgXcQ",
        trailerSite: "youtube",
        castJson: JSON.stringify([
          {
            role: "MAIN",
            name: "Personagem Principal",
            image: null,
            voiceActors: [
              { name: "Dublador JP", image: null, language: "Japanese" },
              { name: "Dublador EN", image: null, language: "English" },
            ],
          },
        ]),
        recommendationsJson: JSON.stringify([
          {
            anilistId: RECOMMENDED_INTERNAL_ANILIST_ID,
            titleRomaji: "Anime Recomendado Já Na Lista",
            titleEnglish: null,
            coverImage: null,
          },
          {
            anilistId: RECOMMENDED_EXTERNAL_ANILIST_ID,
            titleRomaji: "Anime Recomendado Externo",
            titleEnglish: null,
            coverImage: null,
          },
          {
            anilistId: RECOMMENDED_HIDDEN_ANILIST_ID,
            titleRomaji: "Anime Recomendado Escondido",
            titleEnglish: null,
            coverImage: null,
          },
        ]),
      },
      update: {},
    });
    animeId = anime.id;
    void internalRecommended;

    // Só se recomenda o que está na plataforma: o externo foi trazido pelo admin; o escondido é só cache da AniList.
    await prisma.catalogEntry.upsert({
      where: { anilistId: RECOMMENDED_EXTERNAL_ANILIST_ID },
      create: { anilistId: RECOMMENDED_EXTERNAL_ANILIST_ID, titleRomaji: "Anime Recomendado Externo", source: "anilist", onPlatform: true },
      update: { onPlatform: true },
    });
    await prisma.catalogEntry.upsert({
      where: { anilistId: RECOMMENDED_HIDDEN_ANILIST_ID },
      create: { anilistId: RECOMMENDED_HIDDEN_ANILIST_ID, titleRomaji: "Anime Recomendado Escondido", source: "anilist", onPlatform: false },
      update: { onPlatform: false },
    });

    await prisma.$disconnect();
  });

  test("mostra o trailer embutido, o elenco com seletor de idioma e as recomendações", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);

    await expect(page.getByRole("heading", { name: "Trailer", exact: true })).toBeVisible();
    await expect(page.frameLocator("iframe[title='Trailer']").locator("body")).toBeAttached();

    await expect(page.getByRole("heading", { name: "Elenco", exact: true })).toBeVisible();
    await expect(page.getByText("Personagem Principal")).toBeVisible();
    await expect(page.getByText("Dublador JP")).toBeVisible();

    await page.getByRole("combobox", { name: "Idioma de dublagem" }).click();
    await page.getByRole("option", { name: "English" }).click();
    await expect(page.getByText("Dublador EN")).toBeVisible();

    await expect(page.getByRole("heading", { name: "Recomendados", exact: true })).toBeVisible();
    const internalLink = page.getByRole("link", { name: "Anime Recomendado Já Na Lista" });
    await expect(internalLink).toBeVisible();
    await expect(internalLink).toHaveAttribute("href", /^\/anime\//);

    const externalLink = page.getByRole("link", { name: "Anime Recomendado Externo" });
    await expect(externalLink).toBeVisible();
    // Fora da lista agora abre a página pública da obra (D-03), não a AniList.
    await expect(externalLink).toHaveAttribute("href", `/obra/${RECOMMENDED_EXTERNAL_ANILIST_ID}`);
    await expect(externalLink).not.toHaveAttribute("target", "_blank");
    // O que é só cache da AniList (fora da plataforma) não é recomendado.
    await expect(page.getByRole("link", { name: "Anime Recomendado Escondido" })).toHaveCount(0);
  });
});
