import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Pedido de 10/11: reação, nota e diário por episódio (com a curva da temporada) e a tier list da temporada.
const WORK = 151001;
const OTHER = 151002;
const DAY = 24 * 3600 * 1000;

test.describe.serial("Reações e diário por episódio; tier list da temporada", () => {
  let prisma: PrismaClient;
  let userId = "";
  let animeId = "";

  async function clean() {
    await prisma.episodeReaction.deleteMany({ where: { workKey: { in: [String(WORK), String(OTHER)] } } });
    await prisma.tierList.deleteMany({ where: { userId, season: "FALL", seasonYear: 2026 } });
    await prisma.post.deleteMany({ where: { userId, body: { contains: "Round151" } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: { in: [WORK, OTHER] } } });
    await prisma.anime.deleteMany({ where: { userId, anilistId: { in: [WORK, OTHER] } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: [WORK, OTHER] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();
    const now = Date.now();
    for (const anilistId of [WORK, OTHER]) await prisma.catalogEntry.create({ data: { anilistId, titleRomaji: `Obra ${anilistId} Round151`, source: "anilist", onPlatform: true, season: "FALL", seasonYear: 2026 } });
    await prisma.airingScheduleEntry.createMany({
      data: [
        { anilistId: WORK, episode: 1, airingAt: new Date(now - 14 * DAY), titleRomaji: "Obra Round151" },
        { anilistId: WORK, episode: 2, airingAt: new Date(now - 7 * DAY), titleRomaji: "Obra Round151" },
        { anilistId: WORK, episode: 3, airingAt: new Date(now + 2 * DAY), titleRomaji: "Obra Round151" },
      ],
    });
    animeId = (await prisma.anime.create({ data: { userId, anilistId: WORK, titleRomaji: `Obra ${WORK} Round151`, season: "FALL", seasonYear: 2026, status: "RELEASING" } })).id;
    await prisma.anime.create({ data: { userId, anilistId: OTHER, titleRomaji: `Obra ${OTHER} Round151`, season: "FALL", seasonYear: 2026, status: "RELEASING" } });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("API: só episódio que já foi ao ar; tudo vazio apaga; o diário não sai para os outros", async ({ request }) => {
    expect((await request.put("/api/episode-reactions", { data: { work: String(WORK), episode: 3, emoji: "🔥" } })).status()).toBe(409);
    expect((await request.put("/api/episode-reactions", { data: { work: String(WORK), episode: 1, emoji: "💩" } })).status()).toBe(400);
    expect((await request.put("/api/episode-reactions", { data: { work: String(WORK), episode: 1, rating: 9 } })).status()).toBe(400);
    const ok = await request.put("/api/episode-reactions", { data: { work: String(WORK), episode: 1, emoji: "😭", rating: 4, note: "chorei no final" } });
    expect(ok.status()).toBe(200);
    const data = await (await request.get(`/api/episode-reactions?obra=${WORK}`)).json();
    expect(data.aired).toEqual([1, 2]);
    expect(data.stats).toEqual([{ episode: 1, reactions: 1, ratings: 1, avgRating: 4, topEmojis: [{ emoji: "😭", count: 1 }] }]);
    expect(JSON.stringify(data.stats)).not.toContain("chorei");
    expect(data.mine[0]).toMatchObject({ episode: 1, note: "chorei no final" });
    await request.put("/api/episode-reactions", { data: { work: String(WORK), episode: 1, emoji: null, rating: null, note: "" } });
    expect((await (await request.get(`/api/episode-reactions?obra=${WORK}`)).json()).mine).toEqual([]);
  });

  test("na página da obra: escolhe o episódio na curva, reage, dá nota, escreve no diário", async ({ page }) => {
    await page.goto(`/anime/${animeId}`);
    const panel = page.getByTestId("episode-reactions");
    await expect(panel).toBeVisible();
    await panel.getByTestId("curve-ep-2").click();
    await panel.getByRole("button", { name: "Reagir com 🔥" }).click();
    // A nota do MUI é um grupo de rádios escondidos atrás de rótulos: clica no rótulo da 5ª estrela.
    await panel.locator("label").filter({ hasText: "5 Stars" }).click();
    await panel.getByTestId("episode-note").fill("o melhor até agora");
    await panel.getByTestId("episode-save").click();
    await expect(panel.getByText("Episódio 2 salvo.")).toBeVisible();
    await expect(panel.getByTestId("episode-diary")).toContainText("Ep. 2 🔥 — o melhor até agora");
    await expect(panel.getByText(/O ponto alto até agora: episódio 2/)).toBeVisible();
  });

  test("tier list: arrasta uma obra, toca na outra e no tier, publica no Feed com o mesmo quadro e a #tierlist", async ({ page }) => {
    await page.goto("/tier-list?temporada=autumn2026");
    const list = page.getByTestId("tier-list");
    // Arrastar com o mouse até a faixa do S (pedido de 11/11). Tela alta: a obra e o S cabem juntos, sem rolar.
    await page.setViewportSize({ width: 1280, height: 1400 });
    const from = (await list.getByTestId(`tier-work-${WORK}`).boundingBox())!;
    const to = (await list.getByTestId("tier-row-S").boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 + 20, from.y + from.height / 2 - 10, { steps: 3 });
    await expect(page.getByTestId("tier-drag-ghost")).toBeVisible();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(list.getByTestId("tier-row-S").getByTestId(`tier-work-${WORK}`)).toBeVisible();
    await expect(page.getByTestId("tier-drag-ghost")).toHaveCount(0);
    // Soltar não seleciona a obra; tocar na obra e no tier continua funcionando.
    await expect(list.getByTestId(`tier-work-${WORK}`)).toHaveAttribute("aria-pressed", "false");
    await list.getByTestId(`tier-work-${OTHER}`).click();
    await list.getByTestId("tier-B").click();
    await list.getByTestId("tier-publish").click();
    await expect(list.getByTestId("tier-message")).toHaveText("Publicada no Feed.");
    const saved = await prisma.tierList.findUniqueOrThrow({ where: { userId_season_seasonYear: { userId, season: "FALL", seasonYear: 2026 } } });
    expect(JSON.parse(saved.tiersJson)).toMatchObject({ S: [String(WORK)], B: [String(OTHER)] });
    const post = await prisma.post.findUniqueOrThrow({ where: { id: saved.postId as string } });
    expect(post.body).toContain(`S: Obra ${WORK} Round151`);
    expect(post.body).toContain("#tierlist");
    // A publicação mostra o quadro (S/A/B/C/D com as capas), não as linhas de texto.
    await page.goto(`/publicacao/${post.id}`);
    const board = page.getByTestId("post-tier-board").first();
    await expect(board.getByTestId("tier-row-S").getByTestId("post-tier-work")).toHaveAttribute("href", `/anime/${WORK}`);
    await expect(board.getByTestId("tier-row-B").getByTestId("post-tier-work")).toHaveAttribute("title", `Obra ${OTHER} Round151`);
    await expect(page.getByText(`S: Obra ${WORK} Round151`)).toHaveCount(0);
    await expect(page.getByText("Minha tier list de Outono 2026").first()).toBeVisible();
    // Obra que não é da pessoa não entra.
    const res = await page.request.put("/api/tier-lists", { data: { season: "FALL", seasonYear: 2026, tiers: { S: ["999999"] } } });
    expect((await res.json()).tiers.S).toEqual([]);
  });
});
