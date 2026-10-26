import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// A antiga aba "Comunidade" virou o Feed (publicações e notícias com hashtags, como no Twitter/Instagram). A lateral ganha
// "Em alta agora": as hashtags com mais publicações nos últimos 7 dias, em ordem e com a contagem; o que é mais antigo
// não conta.
const HOT = "round119quente";
const WARM = "round119morna";
const OLD = "round119antiga";

test.describe.serial("Feed e hashtags em alta", () => {
  let prisma: PrismaClient;

  async function clean() {
    await prisma.post.deleteMany({ where: { body: { contains: "Round119" } } });
    await prisma.hashtag.deleteMany({ where: { key: { in: [HOT, WARM, OLD] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    const userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    const tag = async (key: string) => (await prisma.hashtag.create({ data: { key, display: key, kind: "TOPIC" } })).id;
    const [hot, warm, old] = [await tag(HOT), await tag(WARM), await tag(OLD)];
    const post = async (hashtagId: string, daysAgo: number) =>
      prisma.post.create({ data: { userId, body: `Round119 #${hashtagId}`, createdAt: new Date(Date.now() - daysAgo * 86_400_000), hashtags: { create: { hashtagId } } } });
    // Quente: 40 publicações recentes (passa qualquer hashtag de outros testes); morna: 30; antiga: 50, mas de 10 dias atrás.
    for (let i = 0; i < 40; i++) await post(hot, 1);
    for (let i = 0; i < 30; i++) await post(warm, 2);
    for (let i = 0; i < 50; i++) await post(old, 10);
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("a API ordena pelas publicações dos últimos 7 dias e ignora o que é mais antigo", async ({ request }) => {
    const { trending, days } = await (await request.get("/api/hashtags?trending=1")).json();
    expect(days).toBe(7);
    const keys = trending.map((t: { key: string }) => t.key);
    expect(keys.slice(0, 2)).toEqual([HOT, WARM]);
    expect(keys).not.toContain(OLD);
    expect(trending[0]).toMatchObject({ key: HOT, postCount: 40 });
  });

  test("o menu e a página dizem Feed; 'Em alta agora' leva à página da hashtag", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Feed" })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Navegação principal" }).first().getByRole("link", { name: "Feed" })).toHaveAttribute("aria-current", "page");
    const box = page.getByTestId("trending-hashtags");
    await expect(box).toContainText("Em alta agora");
    await expect(box.getByTestId(`trending-${HOT}`)).toContainText("40 publicações nos últimos 7 dias");
    await box.getByTestId(`trending-${HOT}`).click();
    await expect(page).toHaveURL(new RegExp(`/hashtag/${HOT}$`));
  });
});
