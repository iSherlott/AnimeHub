import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";

// Pedido de 11/11: notícias do Feed em português com botão para inglês/japonês, imagem no formato de feed, recomendar por
// link para quem não tem conta e os menus novos em abas (Temporada; Eventos dentro de Comunidades).
const HUB_EMAIL = "newshub-154@system.invalid";
const WORK = 154001;
const WIDE_IMAGE = "https://img.round154.test/kv-wide.jpg";

test.describe.serial("Notícias traduzidas, imagem do feed, link de recomendação e abas", () => {
  let prisma: PrismaClient;
  let postId = "";

  async function clean() {
    await prisma.post.deleteMany({ where: { user: { email: HUB_EMAIL } } });
    await prisma.user.deleteMany({ where: { email: HUB_EMAIL } });
    await prisma.recommendationLink.deleteMany({ where: { workKey: String(WORK) } });
    await prisma.production.deleteMany({ where: { anilistId: WORK } });
    await prisma.franchise.deleteMany({ where: { rootAnilistId: WORK } });
    await deleteCatalogEntries(prisma, { where: { anilistId: WORK } });
    await prisma.imageSize.deleteMany({ where: { url: WIDE_IMAGE } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    await clean();
    const franchise = await prisma.franchise.create({ data: { rootAnilistId: WORK, name: "Link Round154" } });
    await prisma.production.create({ data: { anilistId: WORK, franchiseId: franchise.id, titleRomaji: "Link Round154", seasonNumber: 1, format: "TV", status: "RELEASING", fetchedAt: new Date() } });
    await prisma.catalogEntry.create({ data: { anilistId: WORK, titleRomaji: "Link Round154", source: "anilist", onPlatform: true, genres: "Ação,Comédia", descriptionPt: "Uma <i>heroína</i> descobre o mundo.", seasonYear: 2026, episodes: 12, format: "TV" } });
    // Uma "notícia" do NewsHub em japonês, já traduzida, com uma imagem deitada (1200×630) medida.
    const hub = await prisma.user.create({ data: { email: HUB_EMAIL, displayName: "NewsHub Round154", passwordHash: "x", passwordSalt: "y" } });
    await prisma.imageSize.create({ data: { url: WIDE_IMAGE, width: 1200, height: 630 } });
    const post = await prisma.post.create({
      data: {
        userId: hub.id,
        body: "第2期キービジュアル公開！Round154\n\nFonte: Site oficial — https://example.jp/news/1",
        bodyLang: "ja",
        imageUrls: [WIDE_IMAGE],
        translations: {
          create: [
            { lang: "pt", body: "Divulgado o visual da 2ª temporada! Round154\n\nFonte: Site oficial — https://example.jp/news/1" },
            { lang: "en", body: "Season 2 key visual revealed! Round154\n\nFonte: Site oficial — https://example.jp/news/1" },
          ],
        },
      },
    });
    postId = post.id;
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("a notícia abre em português e o botão troca para o inglês e o japonês (o original)", async ({ page }) => {
    await page.goto(`/publicacao/${postId}`);
    await expect(page.getByText("Divulgado o visual da 2ª temporada! Round154")).toBeVisible();
    const switcher = page.getByTestId("post-language").first();
    await expect(switcher.getByTestId("post-lang-pt")).toHaveAttribute("aria-pressed", "true");
    await expect(switcher).toContainText("tradução automática");
    await switcher.getByTestId("post-lang-en").click();
    await expect(page.getByText("Season 2 key visual revealed! Round154")).toBeVisible();
    await switcher.getByTestId("post-lang-ja").click();
    await expect(page.getByText("第2期キービジュアル公開！Round154")).toBeVisible();
    await expect(switcher).toContainText("original");
  });

  test("a imagem deitada ganha um quadro deitado (1,91:1 no máximo), não o recorte em pé", async ({ page }) => {
    await page.goto(`/publicacao/${postId}`);
    // O endereço do teste não existe (a imagem não carrega): o quadro segue a medida guardada, não a foto carregada.
    const frame = page.getByTestId("post-image-frame").first();
    await expect(frame).toBeVisible();
    const box = (await frame.boundingBox())!;
    const ratio = box.width / box.height;
    expect(ratio).toBeGreaterThan(1.85);
    expect(ratio).toBeLessThan(1.95);
  });

  test("recomendar por link: gera o link com o bilhete, e quem não tem conta abre a obra e o recado", async ({ page, browser }) => {
    await page.goto(`/anime/${WORK}`);
    await page.getByTestId("recommend-open").click();
    const dialog = page.getByRole("dialog", { name: "Recomendar Link Round154" });
    await dialog.getByTestId("recommend-note").fill("Assiste, é curtinho!");
    await dialog.getByTestId("recommend-link-create").click();
    const url = await dialog.getByTestId("recommend-link-url").inputValue();
    expect(url).toMatch(/\/r\/[A-Za-z0-9]{10}$/);
    await expect(dialog.getByRole("link", { name: "Mandar no WhatsApp" })).toHaveAttribute("href", /wa\.me\/\?text=.*Assiste/);

    // Visitante (sem cookie de sessão): a página é pública.
    const visitor = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const vp = await visitor.newPage();
    await vp.goto(url);
    const card = vp.getByTestId("recommendation-link");
    await expect(card.getByRole("heading", { name: "Link Round154" })).toBeVisible();
    await expect(card.getByTestId("recommendation-note")).toContainText("Assiste, é curtinho!");
    await expect(card).toContainText("Uma heroína descobre o mundo.");
    await expect(card.getByTestId("recommendation-open-work")).toHaveAttribute("href", `/anime/${WORK}`);
    await visitor.close();
    const code = url.split("/r/")[1];
    expect((await prisma.recommendationLink.findUniqueOrThrow({ where: { code } })).views).toBe(1);

    // Gerar de novo mantém o endereço e atualiza o bilhete; código inválido não abre nada.
    const again = await page.request.post("/api/recommendations/link", { data: { work: String(WORK), note: "Mudei o bilhete" } });
    expect((await again.json()).url).toBe(`/r/${code}`);
    expect((await prisma.recommendationLink.findUniqueOrThrow({ where: { code } })).note).toBe("Mudei o bilhete");
    expect((await page.request.get("/r/naoexiste1")).status()).toBe(404);
  });

  test("Eventos é uma aba de Comunidades, e o menu da conta não tem mais as telas da temporada", async ({ page }) => {
    await page.goto("/comunidades");
    await page.getByTestId("communities-tab-eventos").click();
    await expect(page).toHaveURL(/\/eventos$/);
    await expect(page.getByTestId("communities-tab-eventos")).toHaveAttribute("aria-current", "page");
    await page.getByRole("button", { name: "Menu da conta" }).click();
    for (const name of [/Tier list/, /Bolão/, /Aberturas/, /Eventos/]) await expect(page.getByRole("menuitem", { name })).toHaveCount(0);
  });

  test("a Temporada tem as quatro abas", async ({ page }) => {
    await page.goto("/bolao");
    const tabs = page.getByTestId("season-tabs");
    await expect(tabs.getByRole("link")).toHaveText(["Tier list", "Bolão", "Aberturas", "Retrospectiva"]);
    await expect(tabs.getByTestId("season-tabs-bolao")).toHaveAttribute("aria-current", "page");
  });
});
