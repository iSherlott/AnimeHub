import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Pedido de 10/11: personagens e dubladores (com favoritos no perfil) e aberturas/encerramentos com ranking da temporada.
const WORK = 153001;
const CHAR = 9153001;
const ACTOR = 9153101;

test.describe.serial("Personagens, dubladores e aberturas", () => {
  let prisma: PrismaClient;
  let userId = "";

  async function clean() {
    await prisma.favoriteCharacter.deleteMany({ where: { characterId: CHAR } });
    await prisma.workCharacter.deleteMany({ where: { anilistId: WORK } });
    await prisma.character.deleteMany({ where: { id: CHAR } });
    await prisma.voiceActor.deleteMany({ where: { id: ACTOR } });
    await prisma.workTheme.deleteMany({ where: { anilistId: WORK } });
    await prisma.production.deleteMany({ where: { anilistId: WORK } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: WORK } });
    await deleteCatalogEntries(prisma, { where: { anilistId: WORK } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();
    const franchise = await prisma.franchise.create({ data: { rootAnilistId: WORK, name: "Elenco Round153" } });
    await prisma.production.create({ data: { anilistId: WORK, franchiseId: franchise.id, titleRomaji: "Elenco Round153", seasonNumber: 1, format: "TV", status: "RELEASING", season: "WINTER", seasonYear: 2098, fetchedAt: new Date() } });
    await prisma.catalogEntry.create({ data: { anilistId: WORK, titleRomaji: "Elenco Round153", source: "anilist", onPlatform: true, season: "WINTER", seasonYear: 2098 } });
    await prisma.character.create({ data: { id: CHAR, name: "Heroína Round153", nativeName: "ヒロイン" } });
    await prisma.voiceActor.create({ data: { id: ACTOR, name: "Dubladora Round153" } });
    await prisma.workCharacter.create({ data: { anilistId: WORK, characterId: CHAR, role: "MAIN", voiceActorId: ACTOR } });
    await prisma.workTheme.createMany({
      data: [
        { anilistId: WORK, type: "OP", sequence: 1, slug: "OP1", title: "Abertura Round153", artists: "Banda X", episodes: "1-12", sourceUrl: "https://animethemes.moe/anime/elenco/OP1" },
        { anilistId: WORK, type: "ED", sequence: 1, slug: "ED1", title: "Encerramento Round153", artists: "Cantora Y", sourceUrl: "https://animethemes.moe/anime/elenco/ED1" },
      ],
    });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("a ficha da obra mostra os personagens (com o dublador) e as músicas com link para o AnimeThemes", async ({ page }) => {
    await page.goto(`/anime/${WORK}`);
    const character = page.getByTestId("work-character").filter({ hasText: "Heroína Round153" });
    await expect(character).toContainText("Principal");
    await expect(character.getByRole("link", { name: "Dubladora Round153" })).toHaveAttribute("href", `/dublador/${ACTOR}`);
    const op = page.getByTestId("work-theme").filter({ hasText: "Abertura Round153" });
    await expect(op).toContainText("Banda X · eps 1-12");
    await expect(op.getByRole("link", { name: "Assistir no AnimeThemes ↗" })).toHaveAttribute("target", "_blank");
    await op.getByTestId("theme-like").click();
    await expect(op.getByTestId("theme-like")).toHaveText("1");
  });

  test("personagem: favoritar aparece no perfil; o dublador lista os papéis", async ({ page }) => {
    await page.goto(`/personagem/${CHAR}`);
    await expect(page.getByRole("heading", { name: "Heroína Round153" })).toBeVisible();
    await page.getByTestId("favorite-character").click();
    await expect(page.getByTestId("favorite-character")).toHaveText("Favorito no perfil");
    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("profile-favorite-characters").getByRole("link", { name: /Heroína Round153/ })).toBeVisible();
    await page.goto(`/dublador/${ACTOR}`);
    await expect(page.getByTestId("actor-role")).toContainText("Heroína Round153 em Elenco Round153");
  });

  test("ranking das aberturas da temporada, pelas curtidas", async ({ page }) => {
    await page.goto("/aberturas?temporada=winter2098&tipo=OP");
    const ranking = page.getByTestId("themes-ranking");
    await expect(ranking.getByTestId("work-theme").first()).toContainText("Abertura Round153");
    await page.goto("/aberturas?temporada=winter2098&tipo=ED");
    await expect(page.getByTestId("themes-ranking")).toContainText("Encerramento Round153");
  });
});
