import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Imagens nas publicações: no campo do Feed (e no editor completo) dá para anexar até 4 imagens — pelo botão ou colando —
// que sobem na hora (GIF continua animado). O Postar espera o envio, não deixa seguir com imagem que falhou e aceita
// publicação só de imagem. As imagens vão junto do campo do Feed para o editor completo.
const TAG = "Imagens138";

const png = async (r: number) => ({ name: `foto-${r}.png`, mimeType: "image/png", buffer: await sharp({ create: { width: 320, height: 200, channels: 3, background: { r, g: 40, b: 90 } } }).png().toBuffer() });
const gif = async () => {
  const frame = (r: number) => sharp({ create: { width: 120, height: 80, channels: 3, background: { r, g: 20, b: 60 } } }).png().toBuffer();
  return { name: "anima.gif", mimeType: "image/gif", buffer: await sharp([await frame(220), await frame(30)], { join: { animated: true } }).gif().toBuffer() };
};

/** Tira as imagens do rascunho (remover renumera as outras: sempre a primeira). */
async function clearImages(page: Page) {
  const removers = page.getByRole("button", { name: /Remover a imagem/ });
  while ((await removers.count()) > 0) await removers.first().click();
  await expect(page.getByTestId("post-image-attachment")).toHaveCount(0);
}

async function openComposer(page: Page) {
  await page.goto("/");
  await page.getByRole("textbox", { name: "O que está acontecendo?" }).click();
}

test.describe.serial("Imagens nas publicações", () => {
  let prisma: PrismaClient;
  let userId = "";

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
  });

  test.afterAll(async () => {
    await prisma.post.deleteMany({ where: { userId, OR: [{ body: { contains: TAG } }, { body: "" }] } });
    await prisma.$disconnect();
  });

  test("anexa pelo botão, mostra a miniatura e publica só imagem; a imagem aparece no Feed", async ({ page }) => {
    await openComposer(page);
    await expect(page.getByTestId("composer-post")).toBeDisabled();
    await page.getByTestId("composer-image-input").setInputFiles([await png(200)]);
    const tile = page.getByTestId("post-image-attachment");
    await expect(tile).toHaveCount(1);
    await expect(tile).toHaveAttribute("data-status", "done");
    await expect(page.getByTestId("composer-post")).toBeEnabled();
    await page.getByTestId("composer-post").click();
    await expect(page.getByTestId("post-image-attachments")).toHaveCount(0);

    const saved = await prisma.post.findFirstOrThrow({ where: { userId, body: "" }, orderBy: { createdAt: "desc" } });
    expect(saved.imageUrls).toHaveLength(1);
    expect(saved.imageUrls[0]).toMatch(/\/api\/uploads\/posts\/\d{4}-\d{2}\/[0-9a-f-]+\.webp$/);
    const card = page.getByTestId(`post-card-${saved.id}`);
    await expect(card.locator("img").first()).toHaveAttribute("src", saved.imageUrls[0]);
    // A imagem foi guardada de verdade e é servida.
    expect((await page.request.get(saved.imageUrls[0])).status()).toBe(200);
  });

  test("até 4 imagens: a quinta é recusada com aviso; remover libera a vaga", async ({ page }) => {
    await openComposer(page);
    await page.getByTestId("composer-image-input").setInputFiles(await Promise.all([10, 60, 110, 160, 210].map(png)));
    await expect(page.getByTestId("post-image-attachment")).toHaveCount(4);
    await expect(page.getByText("No máximo 4 imagens por publicação.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Adicionar imagem" })).toBeDisabled();
    await page.getByRole("button", { name: "Remover a imagem 2" }).click();
    await expect(page.getByTestId("post-image-attachment")).toHaveCount(3);
    await expect(page.getByRole("button", { name: "Adicionar imagem" })).toBeEnabled();
  });

  test("imagem que falha no envio bloqueia o Postar até ser removida", async ({ page }) => {
    await openComposer(page);
    await page.getByRole("textbox", { name: "O que está acontecendo?" }).fill(`Com falha ${TAG}`);
    await page.getByTestId("composer-image-input").setInputFiles({ name: "falsa.png", mimeType: "image/png", buffer: Buffer.from("isto não é imagem") });
    const tile = page.getByTestId("post-image-attachment").last();
    await expect(tile).toHaveAttribute("data-status", "error");
    await expect(tile).toContainText("Remova para publicar.");
    await expect(page.getByTestId("composer-post")).toBeDisabled();
    await tile.getByRole("button", { name: /Remover a imagem/ }).click();
    await expect(page.getByTestId("composer-post")).toBeEnabled();
  });

  test("GIF continua animado depois do envio", async ({ page }) => {
    await openComposer(page);
    // Limpa o que sobrou do teste anterior no rascunho.
    await clearImages(page);
    await page.getByTestId("composer-image-input").setInputFiles(await gif());
    await expect(page.getByTestId("post-image-attachment").last()).toHaveAttribute("data-status", "done");
    // A miniatura segue com a prévia local; o endereço guardado fica no próprio item.
    const url = await page.getByTestId("post-image-attachment").last().getAttribute("data-url");
    const stored = Buffer.from(await (await page.request.get(url!)).body());
    expect((await sharp(stored).metadata()).pages).toBe(2);
  });

  test("texto e imagens vão juntos para o editor completo, que publica com as imagens", async ({ page }) => {
    await openComposer(page);
    await clearImages(page);
    await expect(page.getByTestId("post-image-attachment")).toHaveCount(0);
    await page.getByRole("textbox", { name: "O que está acontecendo?" }).fill(`Pelo editor ${TAG}`);
    await page.getByTestId("composer-image-input").setInputFiles([await png(90), await png(140)]);
    await expect(page.locator('[data-testid="post-image-attachment"][data-status="done"]')).toHaveCount(2);
    await page.getByRole("link", { name: "Abrir editor completo" }).click();
    await expect(page).toHaveURL(/\/publicar$/);
    await expect(page.getByPlaceholder("Que conversa você quer começar?")).toHaveValue(`Pelo editor ${TAG}`);
    await expect(page.getByTestId("post-image-attachment")).toHaveCount(2);
    await page.getByTestId("publish-send").click();
    await expect(page).toHaveURL(/\/publicacao\//);
    const saved = await prisma.post.findFirstOrThrow({ where: { userId, body: `Pelo editor ${TAG}` } });
    expect(saved.imageUrls).toHaveLength(2);
  });

  test("no celular, o botão de imagem e as miniaturas cabem na tela", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openComposer(page);
    await page.getByTestId("composer-image-input").setInputFiles([await png(30), await png(80)]);
    await expect(page.locator('[data-testid="post-image-attachment"][data-status="done"]')).toHaveCount(2);
    const box = (await page.getByTestId("post-image-attachments").boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    const add = (await page.getByRole("button", { name: "Adicionar imagem" }).boundingBox())!;
    expect(add.width).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    await clearImages(page);
  });
});
