import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { deleteCatalogEntries } from "./catalog-cleanup";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Toques finais da prévia da obra: a sinopse aparece mesmo quando a lista não a trouxe (Explorar paginado, Feed);
// com a prévia aberta, ← → passam ao anime vizinho (na gaveta do celular, os botões ‹ ›); arrastar a gaveta para baixo
// fecha; e no Feed o nome da obra abre a prévia em vez de tirar a pessoa do Feed.
const A = 135001;
const B = 135002;
const GENRE = "Round135Genero";
const TAG = "Previa135";

async function openExploreGenre(page: Page) {
  await page.goto("/discover");
  await page.getByLabel("Gênero").selectOption(GENRE);
  await expect(page.getByTestId(`explore-open-anilist-${A}`)).toBeVisible();
  await expect(page.getByTestId(`explore-open-anilist-${B}`)).toBeVisible();
}

test.describe.serial("Prévia: sinopse sob demanda, vizinhos e gaveta", () => {
  let prisma: PrismaClient;
  let userId = "";
  let postId = "";

  async function clean() {
    await prisma.post.deleteMany({ where: { anilistId: { in: [A, B] } } });
    await deleteCatalogEntries(prisma, { where: { anilistId: { in: [A, B] } } });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await clean();
    for (const [anilistId, name] of [[A, "Alfa"], [B, "Beta"]] as const) {
      await prisma.catalogEntry.create({
        data: {
          source: "anilist",
          onPlatform: true,
          kind: "EPISODE",
          status: "FINISHED",
          format: "TV",
          anilistId,
          titleRomaji: `${TAG} ${name}`,
          seasonYear: 2022,
          genres: GENRE,
          description: `Original synopsis ${name}.`,
          descriptionPt: `Sinopse em português ${name} ${TAG}.`,
        },
      });
    }
    postId = (await prisma.post.create({ data: { userId, body: `Comentando ${TAG}`, anilistId: A, animeTitleRomaji: `${TAG} Alfa` } })).id;
  });

  test.afterAll(async () => {
    await clean();
    await prisma.$disconnect();
  });

  test("a prévia busca a sinopse e os gêneros da obra pela chave do endereço", async ({ request }) => {
    const res = await request.get(`/api/catalog/preview?work=${A}`);
    expect(res.status()).toBe(200);
    expect(await res.json()).toMatchObject({ anilistId: A, descriptionPt: `Sinopse em português Alfa ${TAG}.`, genres: [GENRE] });
    expect((await request.get("/api/catalog/preview?work=anidb-0")).status()).toBe(400);
    expect((await request.get("/api/catalog/preview?work=qualquer")).status()).toBe(400);
    expect((await request.get("/api/catalog/preview?work=135999")).status()).toBe(404);
  });

  test.describe("computador", () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test("Explorar: a prévia mostra a sinopse; ← → passam ao anime vizinho", async ({ page }) => {
      await openExploreGenre(page);
      await page.getByTestId(`explore-open-anilist-${A}`).click();
      const alfa = page.getByRole("dialog", { name: `Prévia de ${TAG} Alfa` });
      await expect(alfa).toContainText(`Sinopse em português Alfa ${TAG}.`);
      await expect(alfa).toHaveAttribute("aria-keyshortcuts", "ArrowLeft ArrowRight");

      // Os dois cartões são vizinhos (mesmo gênero, só eles); qual vem antes depende da ordenação.
      const order = await page.locator("[data-work-trigger]").evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
      const step = order.indexOf(`explore-open-anilist-${B}`) > order.indexOf(`explore-open-anilist-${A}`) ? "ArrowRight" : "ArrowLeft";
      const back = step === "ArrowRight" ? "ArrowLeft" : "ArrowRight";
      await page.keyboard.press(step);
      const beta = page.getByRole("dialog", { name: `Prévia de ${TAG} Beta` });
      await expect(beta).toContainText(`Sinopse em português Beta ${TAG}.`);
      await expect(alfa).toBeHidden();
      await page.keyboard.press(back);
      await expect(alfa).toBeVisible();
      await expect(beta).toBeHidden();
      await page.keyboard.press("Escape");
      await expect(alfa).toBeHidden();
    });

    test("Feed/perfil: o nome da obra na publicação abre a prévia, com a comunidade dela", async ({ page }) => {
      await page.goto(`/users/${userId}`);
      await page.getByTestId(`post-work-${postId}`).click();
      const preview = page.getByRole("dialog", { name: `Prévia de ${TAG} Alfa` });
      await expect(preview).toContainText(`Sinopse em português Alfa ${TAG}.`);
      await expect(preview.getByRole("link", { name: "Ver página da obra" })).toHaveAttribute("href", `/anime/${A}`);
      await expect(preview.getByRole("link", { name: "Comunidade →" })).toHaveAttribute("href", `/comunidades/${A}`);
      // A sinopse chega depois de aberta: o cartão se reposiciona e continua inteiro na tela.
      await expect.poll(async () => { const b = (await preview.boundingBox())!; return b.y + b.height; }).toBeLessThanOrEqual(800);
      await expect(page).toHaveURL(new RegExp(`/users/${userId}`));
    });
  });

  test.describe("celular", () => {
    test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

    test("na gaveta, ‹ › passam ao anime vizinho; arrastar para baixo fecha", async ({ page }) => {
      await openExploreGenre(page);
      await page.getByTestId(`explore-open-anilist-${A}`).tap();
      const alfa = page.getByRole("dialog", { name: `Prévia de ${TAG} Alfa` });
      await expect(alfa).toContainText(`Sinopse em português Alfa ${TAG}.`);

      const order = await page.locator("[data-work-trigger]").evaluateAll((els) => els.map((el) => el.getAttribute("data-testid")));
      const forward = order.indexOf(`explore-open-anilist-${B}`) > order.indexOf(`explore-open-anilist-${A}`);
      await alfa.getByRole("button", { name: forward ? "Próximo anime" : "Anime anterior" }).tap();
      const beta = page.getByRole("dialog", { name: `Prévia de ${TAG} Beta` });
      await expect(beta).toContainText(`Sinopse em português Beta ${TAG}.`);
      await expect(alfa).toBeHidden();

      // Arrastar a gaveta pela alça, para baixo.
      const box = (await beta.boundingBox())!;
      const x = box.x + box.width / 2;
      const y = box.y + 20;
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let i = 1; i <= 12; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + i * 40 }] });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(beta).toBeHidden();
      await expect(page).toHaveURL(/\/discover/);
    });
  });
});
