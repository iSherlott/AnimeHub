import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_EMAIL, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// Sistema de spoiler: um trecho do texto (||assim||) fica coberto até tocar; imagem marcada fica borrada até "Ver
// imagem"; o aviso diz de qual anime e até onde ("Spoiler de … · até o episódio N"); recados, depoimentos e eventos
// também se marcam; e quem escolhe em Configurações "Mostrar spoilers sem perguntar" vê direto, ainda com a marca.
const TAG = "Spoiler140";
const WORK = 140001;
const adminHeaders = { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` };

async function upload(request: APIRequestContext): Promise<string> {
  const buffer = await sharp({ create: { width: 320, height: 200, channels: 3, background: { r: 30, g: 120, b: 200 } } }).png().toBuffer();
  const res = await request.post("/api/uploads", { multipart: { file: { name: "cena.png", mimeType: "image/png", buffer } } });
  expect(res.status()).toBe(201);
  return (await res.json()).url as string;
}

test.describe.serial("Spoilers", () => {
  let prisma: PrismaClient;
  let userId = "";
  let adminId = "";

  async function clean() {
    await prisma.post.deleteMany({ where: { body: { contains: TAG } } });
    await prisma.scrap.deleteMany({ where: { body: { contains: TAG } } });
    await prisma.testimonial.deleteMany({ where: { body: { contains: TAG } } });
    await prisma.community.deleteMany({ where: { franchiseKey: WORK } });
    await deleteCatalogEntries(prisma, { where: { anilistId: WORK } });
    await prisma.hashtag.deleteMany({ where: { key: { in: ["segredo140", "aberta140"] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    adminId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_ADMIN_EMAIL } })).id;
    await clean();
    await prisma.user.update({ where: { id: userId }, data: { showSpoilers: false } });
    await prisma.catalogEntry.create({ data: { source: "anilist", onPlatform: true, kind: "EPISODE", status: "FINISHED", format: "TV", anilistId: WORK, franchiseKey: WORK, titleRomaji: `Obra ${TAG}`, seasonYear: 2024, timelineOrder: 1 } });
  });

  test.afterAll(async () => {
    await prisma.user.update({ where: { id: userId }, data: { showSpoilers: false } });
    await clean();
    await prisma.$disconnect();
  });

  test("trecho de spoiler: coberto até tocar; a hashtag de dentro não vale e a citação mostra [spoiler]", async ({ page, request }) => {
    const res = await request.post("/api/posts", { data: { body: `No fim ||o herói volta #Segredo140|| e chorei ${TAG} #Aberta140` } });
    expect(res.status()).toBe(201);
    const post = (await res.json()).post;
    expect(await prisma.hashtag.count({ where: { key: "segredo140" } })).toBe(0);
    expect(await prisma.hashtag.count({ where: { key: "aberta140" } })).toBe(1);

    const quote = await (await request.post("/api/posts", { data: { body: `Citando ${TAG}`, quotedPostId: post.id } })).json();
    expect(quote.post.quotedPost.body).toContain("[spoiler]");
    expect(quote.post.quotedPost.body).not.toContain("o herói volta");

    await page.goto(`/publicacao/${post.id}`);
    const card = page.getByTestId(`post-card-${post.id}`);
    const covered = card.locator('[data-spoiler="hidden"]');
    await expect(covered).toHaveCount(1);
    await expect(covered).toHaveAccessibleName("Spoiler: toque para ver");
    await expect(card.getByRole("link", { name: "#Segredo140" })).toHaveCount(0);
    await covered.click();
    await expect(card.locator('[data-spoiler="shown"]')).toContainText("o herói volta");
  });

  test("publicação inteira com o anime e o episódio no aviso; o episódio é validado", async ({ page, request }) => {
    expect((await request.post("/api/posts", { data: { body: `Ep zero ${TAG}`, isSpoiler: true, spoilerEpisode: 0 } })).status()).toBe(400);
    const res = await request.post("/api/posts", { data: { body: `O final é outro ${TAG}`, anilistId: WORK, isSpoiler: true, spoilerEpisode: 7 } });
    expect(res.status()).toBe(201);
    const post = (await res.json()).post;
    expect(post).toMatchObject({ body: "", spoilerEpisode: 7 });
    await page.goto(`/publicacao/${post.id}`);
    const notice = page.getByTestId(`post-card-${post.id}`).getByTestId("spoiler-notice");
    await expect(notice.getByTestId("spoiler-label")).toHaveText(new RegExp(`Spoiler de .*${TAG}.* · até o episódio 7`));
    await notice.getByRole("button", { name: "Revelar conteúdo (spoilers)" }).click();
    await expect(page.getByTestId(`post-card-${post.id}`).getByTestId("spoiler-revealed")).toContainText("O final é outro");
  });

  test("imagem com spoiler: borrada até 'Ver imagem', e a descrição só depois", async ({ page, request }) => {
    const url = await upload(request);
    const res = await request.post("/api/posts", { data: { body: `Olha a cena ${TAG}`, imageUrls: [url], imageAlts: ["O herói voltando"], imageSpoilers: [true] } });
    const post = (await res.json()).post;
    expect(post.imageSpoilers).toEqual([true]);
    await page.goto(`/publicacao/${post.id}`);
    const card = page.getByTestId(`post-card-${post.id}`);
    await expect(card.getByTestId("image-spoiler-cover")).toBeVisible();
    await expect(card.getByRole("img", { name: "O herói voltando" })).toHaveCount(0);
    await card.getByRole("button", { name: "Ver imagem" }).click();
    await expect(card.getByTestId("image-spoiler-cover")).toHaveCount(0);
    await expect(card.getByRole("img", { name: "O herói voltando" })).toBeVisible();
    await expect(card.getByTestId("spoiler-mark")).toBeVisible();
  });

  test("no campo do Feed: esconder o trecho selecionado e marcar uma imagem como spoiler", async ({ page }) => {
    await page.goto("/");
    const field = page.getByRole("textbox", { name: "O que está acontecendo?" });
    await field.click();
    await field.fill(`Ela vence no fim ${TAG}`);
    // Seleciona "vence no fim" e esconde pelo menu do spoiler.
    await field.evaluate((el: HTMLTextAreaElement) => el.setSelectionRange(4, 16));
    await page.getByRole("toolbar", { name: "Opções da publicação" }).getByRole("button", { name: "Spoiler", exact: true }).click();
    await page.getByRole("menuitem", { name: /Esconder um trecho/ }).click();
    await expect(field).toHaveValue(`Ela ||vence no fim|| ${TAG}`);
    const png = await sharp({ create: { width: 200, height: 120, channels: 3, background: { r: 200, g: 60, b: 90 } } }).png().toBuffer();
    await page.getByTestId("composer-image-input").setInputFiles({ name: "x.png", mimeType: "image/png", buffer: png });
    await expect(page.locator('[data-testid="post-image-attachment"][data-status="done"]')).toHaveCount(1);
    await page.getByTestId("image-spoiler-toggle").click();
    await expect(page.getByTestId("image-spoiler-toggle")).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("composer-post").click();
    await expect(field).toHaveValue("");
    const saved = await prisma.post.findFirstOrThrow({ where: { userId, body: { contains: `vence no fim|| ${TAG}` } } });
    expect(saved.imageSpoilers).toEqual([true]);
  });

  test("comunidade: tópico com o aviso da obra e do episódio; trecho coberto na resposta", async ({ page, request }) => {
    expect((await request.post(`/api/communities/${WORK}/membership`)).status()).toBe(200);
    expect((await request.post(`/api/communities/${WORK}/topics`, { data: { title: `Ep zero ${TAG}`, body: "x", isSpoiler: true, spoilerEpisode: "0" } })).status()).toBe(400);
    const topic = await (await request.post(`/api/communities/${WORK}/topics`, { data: { title: `Teoria do final ${TAG}`, body: "O vilão era o mestre.", isSpoiler: true, spoilerEpisode: 12 } })).json();
    await request.post(`/api/communities/topics/${topic.topicId}/replies`, { data: { body: `Concordo, ||ele trai no 11|| ${TAG}` } });
    await page.goto(`/comunidades/${WORK}/topicos/${topic.topicId}`);
    const cover = page.getByTestId("topic-body-spoiler");
    await expect(cover).toContainText(new RegExp(`Spoiler de .*${TAG}.* · até o episódio 12`));
    await expect(page.getByText("O vilão era o mestre.")).toHaveCount(0);
    await cover.getByRole("button", { name: "Mostrar" }).click();
    await expect(page.getByTestId("topic-body")).toContainText("O vilão era o mestre.");
    await expect(page.getByTestId("spoiler-mark").first()).toBeVisible();
    await expect(page.locator('[data-testid="replies"] [data-spoiler="hidden"]')).toHaveCount(1);
  });

  test("recado, depoimento e evento também se marcam como spoiler", async ({ page, request, playwright, baseURL }) => {
    const admin = await playwright.request.newContext({ baseURL, extraHTTPHeaders: adminHeaders });
    expect((await admin.post(`/api/users/${userId}/scraps`, { data: { body: `O fim do arco ${TAG}`, isSpoiler: true } })).status()).toBe(201);
    const pair = userId < adminId ? { userAId: userId, userBId: adminId } : { userAId: adminId, userBId: userId };
    await prisma.friendship.upsert({ where: { userAId_userBId: pair }, create: pair, update: {} });
    expect((await admin.put(`/api/users/${userId}/testimonials`, { data: { body: `Contou o final ${TAG}`, isSpoiler: true } })).status()).toBe(200);
    await admin.dispose();
    const event = await (await request.post(`/api/communities/${WORK}/events`, { data: { title: `Debate ${TAG}`, description: "Sobre a morte do mestre.", isSpoiler: true, startsAt: "2031-04-01T20:00:00Z" } })).json();
    expect(await prisma.scrap.count({ where: { body: { contains: TAG }, isSpoiler: true } })).toBe(1);
    expect(await prisma.testimonial.count({ where: { body: { contains: TAG }, isSpoiler: true } })).toBe(1);

    await page.goto(`/users/${userId}`);
    await expect(page.getByTestId("profile-scraps").getByText(`O fim do arco ${TAG}`)).toHaveCount(0);
    await expect(page.getByTestId("profile-scraps").getByRole("group", { name: "Spoiler" })).toBeVisible();
    await expect(page.getByTestId("testimonials-pending")).not.toContainText(`Contou o final ${TAG}`);

    await page.goto(`/comunidades/${WORK}/eventos`);
    await expect(page.getByTestId(`event-description-${event.eventId}-spoiler`)).toBeVisible();
    await expect(page.getByText("Sobre a morte do mestre.")).toHaveCount(0);
    await prisma.friendship.deleteMany({ where: pair });
  });

  test("Configurações → Mostrar spoilers sem perguntar: aparece direto, com a marca", async ({ page, request }) => {
    await page.goto("/configuracoes");
    await page.getByRole("checkbox", { name: "Mostrar spoilers sem perguntar" }).check({ force: true });
    await page.getByTestId("save-settings").click();
    await expect(page.getByText("Configurações salvas.")).toBeVisible();
    expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).showSpoilers).toBe(true);

    const post = (await (await request.post("/api/posts", { data: { body: `Direto ${TAG}`, isSpoiler: true } })).json()).post;
    const inline = (await (await request.post("/api/posts", { data: { body: `Trecho ||aberto direto|| ${TAG}` } })).json()).post;
    await page.goto(`/publicacao/${post.id}`);
    await expect(page.getByTestId(`post-card-${post.id}`).getByTestId("spoiler-revealed")).toContainText(`Direto ${TAG}`);
    await page.goto(`/publicacao/${inline.id}`);
    await expect(page.getByTestId(`post-card-${inline.id}`).locator('[data-spoiler="shown"]')).toContainText("aberto direto");
  });
});
