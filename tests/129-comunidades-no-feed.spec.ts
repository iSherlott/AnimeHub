import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Comunidades no Feed: a publicação sobre uma obra do catálogo mostra o atalho "Comunidade" (obra fora do catálogo não
// tem comunidade, então não mostra); e a lateral do Feed lista os tópicos mais ativos das comunidades da pessoa.
const S1 = 129001;
const OUTSIDE = 129999;
const TAG = "Feed129";

test.describe.serial("Comunidades no Feed", () => {
  let prisma: PrismaClient;
  let userId = "";
  const id: Record<string, string> = {};

  async function clean() {
    await prisma.post.deleteMany({ where: { anilistId: { in: [S1, OUTSIDE] } } });
    await prisma.community.deleteMany({ where: { franchiseKey: S1 } });
    await deleteCatalogEntries(prisma, { where: { anilistId: S1 } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();
    await prisma.catalogEntry.create({ data: { source: "anilist", onPlatform: true, kind: "EPISODE", status: "FINISHED", format: "TV", anilistId: S1, franchiseKey: S1, titleRomaji: `${TAG} Monogatari`, seasonYear: 2021, timelineOrder: 1 } });
    id.inCatalog = (await prisma.post.create({ data: { userId, body: `Sobre a obra ${TAG}`, anilistId: S1, animeTitleRomaji: `${TAG} Monogatari` } })).id;
    id.outside = (await prisma.post.create({ data: { userId, body: `Obra fora do catálogo ${TAG}`, anilistId: OUTSIDE, animeTitleRomaji: `Fora ${TAG}` } })).id;
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("atalho 'Comunidade' só na publicação sobre obra do catálogo, levando à comunidade dela", async ({ page, request }) => {
    const posts = (await (await request.get("/api/posts?tab=recent")).json()).posts as Array<{ id: string; hasCommunity: boolean }>;
    expect(posts.find((p) => p.id === id.inCatalog)?.hasCommunity).toBe(true);
    expect(posts.find((p) => p.id === id.outside)?.hasCommunity).toBe(false);

    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId(`post-community-${id.outside}`)).toHaveCount(0);
    await page.getByTestId(`post-community-${id.inCatalog}`).click();
    await expect(page).toHaveURL(new RegExp(`/comunidades/${S1}$`));
    await expect(page.getByTestId("community-name")).toContainText(`${TAG} Monogatari`);
  });

  test("lateral do Feed: os tópicos mais ativos das minhas comunidades", async ({ page, request }) => {
    expect((await request.post(`/api/communities/${S1}/membership`)).status()).toBe(200);
    const older = (await (await request.post(`/api/communities/${S1}/topics`, { data: { title: `Tópico antigo ${TAG}`, body: "x" } })).json()).topicId as string;
    const newer = (await (await request.post(`/api/communities/${S1}/topics`, { data: { title: `Tópico novo ${TAG}`, body: "y" } })).json()).topicId as string;
    await request.post(`/api/communities/topics/${older}/replies`, { data: { body: "subiu" } });

    const topics = (await (await request.get("/api/communities/active-topics")).json()).topics as Array<{ id: string; community: string; replyCount: number }>;
    expect(topics.slice(0, 2).map((t) => t.id)).toEqual([older, newer]);
    expect(topics[0]).toMatchObject({ community: `${TAG} Monogatari`, replyCount: 1 });

    await page.goto("/");
    const box = page.getByTestId("sidebar-community-topics");
    await expect(box.getByTestId(`sidebar-topic-${older}`)).toContainText(`Tópico antigo ${TAG}`);
    await expect(box.getByTestId(`sidebar-topic-${older}`)).toContainText("1 resposta");
    await box.getByTestId(`sidebar-topic-${older}`).getByRole("link").click();
    await expect(page).toHaveURL(new RegExp(`/comunidades/${S1}/topicos/${older}\\?pagina=ultima$`));
  });
});
