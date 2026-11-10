import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Pedido de 10/11 (escolha: "por tempo desde a estreia"): o spoiler "até o episódio N" abre para todo mundo 7 dias depois
// de o episódio N ir ao ar. Spoiler sem episódio continua fechado.
const WORK = 150001;
const TAG = "spoilerliberado150";
const DAY = 24 * 3600 * 1000;

test.describe.serial("Spoiler liberado 7 dias depois da estreia", () => {
  let prisma: PrismaClient;
  let userId = "";

  async function clean() {
    await prisma.post.deleteMany({ where: { body: { contains: TAG } } });
    await prisma.airingScheduleEntry.deleteMany({ where: { anilistId: WORK } });
    await deleteCatalogEntries(prisma, { where: { anilistId: WORK } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();
    await prisma.catalogEntry.create({ data: { anilistId: WORK, titleRomaji: "Spoiler Round150", source: "anilist", onPlatform: true } });
    const now = Date.now();
    await prisma.airingScheduleEntry.createMany({
      data: [
        { anilistId: WORK, episode: 3, airingAt: new Date(now - 8 * DAY), titleRomaji: "Spoiler Round150" },
        { anilistId: WORK, episode: 4, airingAt: new Date(now - 2 * DAY), titleRomaji: "Spoiler Round150" },
      ],
    });
    const post = (body: string, spoilerEpisode: number | null) => ({ userId, anilistId: WORK, animeTitleRomaji: "Spoiler Round150", body: `${body} ${TAG}`, isSpoiler: true, spoilerEpisode });
    await prisma.post.createMany({ data: [post("O ep 3 tem a volta do mestre", 3), post("O ep 4 termina com a ponte caindo", 4), post("Spoiler sem episódio", null)] });
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("a API já entrega aberto só o spoiler cujo episódio estreou há mais de 7 dias", async ({ request }) => {
    const { posts } = await (await request.get(`/api/posts?tab=recent&anilistId=${WORK}&limit=10`)).json();
    const byText = (t: string) => (posts as { body: string; isSpoiler: boolean; releasedSpoilerEpisode: number | null; spoilerEpisode: number | null }[]).find((p) => p.body.includes(t) || false);
    const ep3 = byText("volta do mestre");
    expect(ep3).toMatchObject({ isSpoiler: false, releasedSpoilerEpisode: 3 });
    const hidden = (posts as { body: string; isSpoiler: boolean; spoilerEpisode: number | null }[]).filter((p) => p.isSpoiler);
    expect(hidden.map((p) => p.spoilerEpisode).sort()).toEqual([4, null].sort());
    expect(hidden.every((p) => p.body === "")).toBe(true);
  });

  test("no cartão da publicação, o liberado aparece com a marca de que era spoiler", async ({ page }) => {
    // As publicações desta spec são da conta de teste: aparecem nas publicações do perfil dela.
    await page.goto(`/users/${userId}#publicacoes`);
    const card = page.locator('[data-testid^="post-card-"]', { hasText: "volta do mestre" });
    await expect(card.getByTestId("post-spoiler-released")).toContainText("até o episódio 3 · liberado 7 dias depois da estreia");
  });
});
