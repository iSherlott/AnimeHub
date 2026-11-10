import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Pedido de 10/11: a retrospectiva da temporada (só obras e gêneros) e as recomendações que contam com os amigos.
const base = { passwordHash: "e2e-fixture-not-a-real-hash", passwordSalt: "e2e-fixture-not-a-real-salt" };
const EMAILS = ["ana-148@test.local", "beto-148@test.local", "caio-148@test.local"];
const pair = (a: string, b: string) => (a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a });
const MINE = [148001, 148002, 148003];
const FRIENDS_ONLY = 148010; // os dois amigos acompanham; a pessoa não
const HIDDEN_ONLY = 148011; // só quem esconde a lista acompanha
const ALL = [...MINE, FRIENDS_ONLY, HIDDEN_ONLY];
const FALL = { season: "FALL", seasonYear: 2026 };

test.describe.serial("Retrospectiva da temporada e recomendações com amigos", () => {
  let prisma: PrismaClient;
  let userId = "";
  const id: Record<string, string> = {};

  async function clean() {
    await prisma.friendship.deleteMany({ where: { OR: [{ userA: { email: { in: EMAILS } } }, { userB: { email: { in: EMAILS } } }] } });
    await prisma.anime.deleteMany({ where: { anilistId: { in: ALL } } });
    await prisma.user.deleteMany({ where: { email: { in: EMAILS } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: ALL } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();
    for (const anilistId of ALL) {
      await prisma.catalogEntry.create({ data: { anilistId, titleRomaji: `Obra ${anilistId} Round148`, source: "anilist", onPlatform: true, status: "RELEASING", format: "TV", ...FALL, genres: anilistId === MINE[2] ? "Drama" : "Ação,Comédia" } });
    }
    id.ana = (await prisma.user.create({ data: { ...base, email: EMAILS[0], displayName: "Ana Round148", handle: "ana_r148" } })).id;
    id.beto = (await prisma.user.create({ data: { ...base, email: EMAILS[1], displayName: "Beto Round148", handle: "beto_r148" } })).id;
    id.caio = (await prisma.user.create({ data: { ...base, email: EMAILS[2], displayName: "Caio Round148", handle: "caio_r148", animeListPublic: false } })).id;
    await prisma.friendship.createMany({ data: [pair(userId, id.ana), pair(userId, id.beto), pair(userId, id.caio)] });
    const entry = (anilistId: number) => ({ anilistId, titleRomaji: `Obra ${anilistId} Round148`, ...FALL, status: "RELEASING" });
    await prisma.anime.createMany({
      data: [
        { userId, ...entry(MINE[0]), genres: "Ação,Comédia", watchState: "WATCHING" },
        { userId, ...entry(MINE[1]), genres: "Ação,Comédia", watchState: "FINISHED", userScore: 9 },
        { userId, ...entry(MINE[2]), genres: "Drama", watchState: "DROPPED" },
        { userId: id.ana, ...entry(FRIENDS_ONLY), genres: "Ação", userScore: 8 },
        { userId: id.beto, ...entry(FRIENDS_ONLY), genres: "Ação" },
        { userId: id.caio, ...entry(HIDDEN_ONLY), genres: "Ação" },
      ],
    });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("a retrospectiva mostra obras, andamento, gêneros, notas e o que os amigos viram", async ({ page }) => {
    await page.goto("/retrospectiva?temporada=autumn2026");
    await expect(page.getByRole("heading", { level: 1, name: "Sua Outono 2026" })).toBeVisible();
    const recap = page.getByTestId("season-recap");
    // A conta de teste pode ter outras obras de Outono 2026: confere as desta spec.
    await expect(recap.getByTestId("recap-work").filter({ hasText: "Round148" })).toHaveCount(3);
    await expect(recap.getByTestId("recap-work").filter({ hasText: `Obra ${MINE[2]} Round148` })).toContainText("Dropei");
    await expect(recap.getByTestId("recap-genre").first()).toBeVisible();
    await expect(recap.getByTestId("recap-best-work").filter({ hasText: `Obra ${MINE[1]} Round148` })).toContainText("Sua nota: 9");
    const friendWork = recap.getByTestId("recap-friend-work").filter({ hasText: `Obra ${FRIENDS_ONLY} Round148` });
    await expect(friendWork).toContainText("2 amigos");
    // Quem esconde a lista não entra.
    await expect(recap.getByTestId("recap-friend-work").filter({ hasText: `Obra ${HIDDEN_ONLY} Round148` })).toHaveCount(0);
  });

  test("a escolha de temporada troca a retrospectiva; temporada sem obras explica o que fazer", async ({ page }) => {
    await page.goto("/retrospectiva?temporada=winter1990");
    await expect(page.getByRole("heading", { level: 1, name: "Sua Inverno 1990" })).toBeVisible();
    await expect(page.getByText("Nenhuma obra desta temporada na sua lista.")).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Escolher temporada" }).getByRole("link")).toHaveCount(4);
  });

  test("as recomendações do Feed contam com os amigos (sem a lista escondida)", async ({ request }) => {
    const { animes } = await (await request.get("/api/feed/recommendations")).json();
    const friendRec = (animes as { anilistId: number; friendNames: string[] }[]).find((a) => a.anilistId === FRIENDS_ONLY);
    expect(friendRec?.friendNames).toEqual(["Ana Round148", "Beto Round148"]);
    // A obra de quem esconde a lista pode até vir por afinidade de gêneros, mas nunca com o nome do amigo.
    const hidden = (animes as { anilistId: number; friendNames: string[] }[]).find((a) => a.anilistId === HIDDEN_ONLY);
    expect(hidden?.friendNames ?? []).toEqual([]);
  });

  test("o menu da conta leva à retrospectiva", async ({ page }) => {
    await page.goto("/calendar");
    await page.getByRole("button", { name: "Menu da conta" }).click();
    await page.getByRole("menuitem", { name: "Retrospectiva da temporada" }).click();
    await expect(page).toHaveURL(/\/retrospectiva$/);
  });
});
