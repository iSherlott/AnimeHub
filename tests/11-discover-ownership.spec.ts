import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// anilistId/kitsuId altos (900200+), fora da faixa usada pelas outras
// fixtures — não colidem com nenhum teste existente.
const OWNED_ANILIST_ID = 900200; // já está na lista do usuário de teste
const NOT_OWNED_ANILIST_ID = 900201; // nunca foi adicionado por ninguém
// Simula uma entrada de catálogo de origem Kitsu (sem anilistId) que
// corresponde a um Anime que o usuário já tem, mas só reconhecível pelo
// kitsuId — regressão real que annotateOwnership já cometeu uma vez
// (matching só por anilistId, item Kitsu nunca aparecia como "já na lista").
const OWNED_VIA_KITSU_ANILIST_ID = 900202; // Anime.anilistId é obrigatório
const OWNED_VIA_KITSU_KITSU_ID = 900300;

test.describe("Descobrir anota posse (Epic 19)", () => {
  let ownedAnimeId: string;
  let ownedViaKitsuAnimeId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });

    await prisma.catalogEntry.upsert({
      where: { anilistId: OWNED_ANILIST_ID },
      create: { anilistId: OWNED_ANILIST_ID, titleRomaji: "Catálogo Já Na Minha Lista", source: "anilist" },
      update: {},
    });
    await prisma.catalogEntry.upsert({
      where: { anilistId: NOT_OWNED_ANILIST_ID },
      create: { anilistId: NOT_OWNED_ANILIST_ID, titleRomaji: "Catálogo Fora Da Minha Lista", source: "anilist" },
      update: {},
    });
    await prisma.catalogEntry.upsert({
      where: { kitsuId: OWNED_VIA_KITSU_KITSU_ID },
      create: {
        kitsuId: OWNED_VIA_KITSU_KITSU_ID,
        titleRomaji: "Catálogo Kitsu Já Na Minha Lista",
        source: "kitsu",
      },
      update: {},
    });

    const owned = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: OWNED_ANILIST_ID } },
      create: { userId: user.id, anilistId: OWNED_ANILIST_ID, titleRomaji: "Catálogo Já Na Minha Lista", genres: "" },
      update: {},
    });
    ownedAnimeId = owned.id;

    const ownedViaKitsu = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: user.id, anilistId: OWNED_VIA_KITSU_ANILIST_ID } },
      create: {
        userId: user.id,
        anilistId: OWNED_VIA_KITSU_ANILIST_ID,
        kitsuId: OWNED_VIA_KITSU_KITSU_ID,
        titleRomaji: "Catálogo Kitsu Já Na Minha Lista",
        genres: "",
      },
      update: { kitsuId: OWNED_VIA_KITSU_KITSU_ID },
    });
    ownedViaKitsuAnimeId = ownedViaKitsu.id;

    await prisma.$disconnect();
  });

  test("GET /api/catalog marca inMyList/animeId só pro item que já está na lista do usuário logado", async ({
    request,
  }) => {
    const res = await request.get("/api/catalog");
    expect(res.status()).toBe(200);
    const data = await res.json();

    const owned = data.results.find((r: { anilistId: number }) => r.anilistId === OWNED_ANILIST_ID);
    const notOwned = data.results.find((r: { anilistId: number }) => r.anilistId === NOT_OWNED_ANILIST_ID);

    expect(owned).toMatchObject({ inMyList: true, animeId: ownedAnimeId });
    expect(notOwned).toMatchObject({ inMyList: false, animeId: null });
  });

  test("GET /api/catalog também marca posse por kitsuId, pra item de catálogo sem anilistId", async ({
    request,
  }) => {
    const res = await request.get("/api/catalog");
    expect(res.status()).toBe(200);
    const data = await res.json();

    const ownedViaKitsu = data.results.find(
      (r: { kitsuId: number | null }) => r.kitsuId === OWNED_VIA_KITSU_KITSU_ID
    );
    expect(ownedViaKitsu).toMatchObject({
      anilistId: null,
      inMyList: true,
      animeId: ownedViaKitsuAnimeId,
    });
  });

  test("página Descobrir linka o card já-na-lista pra dentro do app, não pra AniList", async ({ page }) => {
    await page.goto("/discover");
    await page.getByPlaceholder("Buscar anime...").fill("Catálogo Já Na Minha Lista");

    const card = page.getByRole("button", { name: "Catálogo Já Na Minha Lista" });
    await expect(card).toBeVisible();
    await card.click();
    await expect(page.getByRole("dialog").getByRole("link", { name: "Ver página da obra" })).toHaveAttribute("href", `/anime/${ownedAnimeId}`);
  });

  test.describe("sem sessão", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("GET /api/catalog não quebra sem login — inMyList sempre false", async ({ request }) => {
      const res = await request.get("/api/catalog");
      expect(res.status()).toBe(200);
      const data = await res.json();
      const owned = data.results.find((r: { anilistId: number }) => r.anilistId === OWNED_ANILIST_ID);
      expect(owned).toMatchObject({ inMyList: false, animeId: null });
    });
  });

  test.describe("outro usuário logado", () => {
    // O maior risco desta feature é vazar a posse de um usuário pro outro —
    // sem este teste, um bug real em annotateOwnership (ex.: esquecer o
    // filtro por userId no where) passaria despercebido, já que os outros
    // testes acima só verificam o próprio dono contra os próprios dados.
    test.use({
      storageState: {
        cookies: [
          {
            name: SESSION_COOKIE_NAME,
            value: TEST_ADMIN_SESSION_TOKEN,
            domain: "localhost",
            path: "/",
            expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
            httpOnly: true,
            secure: false,
            sameSite: "Lax",
          },
        ],
        origins: [],
      },
    });

    test("GET /api/catalog não marca inMyList pra um anime que só está na lista de outro usuário", async ({
      request,
    }) => {
      const res = await request.get("/api/catalog");
      expect(res.status()).toBe(200);
      const data = await res.json();
      const owned = data.results.find((r: { anilistId: number }) => r.anilistId === OWNED_ANILIST_ID);
      expect(owned).toMatchObject({ inMyList: false, animeId: null });
    });
  });
});
