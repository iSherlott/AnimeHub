import { test, expect, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Descrição das imagens (texto alternativo, como o ALT do X): cada miniatura tem "+ ALT", que abre "Descrever imagem";
// a descrição vai junto da imagem, vira o texto alternativo lido pelo leitor de tela e aparece num selo ALT na
// publicação. Até 1.000 caracteres; com spoiler, fica escondida como a imagem; vai junto para o editor completo.
const TAG = "Alt139";
const DESCRIPTION = `Frieren sorrindo no campo de flores azuis ${TAG}`;

const png = async (r: number) => ({ name: `foto-${r}.png`, mimeType: "image/png", buffer: await sharp({ create: { width: 320, height: 200, channels: 3, background: { r, g: 70, b: 120 } } }).png().toBuffer() });

async function clearImages(page: Page) {
  const removers = page.getByRole("button", { name: /Remover a imagem/ });
  while ((await removers.count()) > 0) await removers.first().click();
}

test.describe.serial("Descrição das imagens", () => {
  let prisma: PrismaClient;
  let userId = "";

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
  });

  test.afterAll(async () => {
    await prisma.post.deleteMany({ where: { userId, body: { contains: TAG } } });
    await prisma.$disconnect();
  });

  test("descreve a imagem ao postar; a publicação usa a descrição como texto alternativo e mostra o selo ALT", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("textbox", { name: "O que está acontecendo?" }).click();
    await clearImages(page);
    await page.getByRole("textbox", { name: "O que está acontecendo?" }).fill(`Com descrição ${TAG}`);
    await page.getByTestId("composer-image-input").setInputFiles([await png(180), await png(40)]);
    await expect(page.locator('[data-testid="post-image-attachment"][data-status="done"]')).toHaveCount(2);

    await page.getByRole("button", { name: "Descrever a imagem 1" }).click();
    const dialog = page.getByRole("dialog", { name: "Descrever imagem 1" });
    await dialog.getByLabel("Descrição").fill(DESCRIPTION);
    await expect(dialog).toContainText(`${DESCRIPTION.length}/1000`);
    await dialog.getByRole("button", { name: "Salvar descrição" }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Editar a descrição da imagem 1" })).toHaveText("ALT ✓");
    await expect(page.getByRole("button", { name: "Descrever a imagem 2" })).toHaveText("+ ALT");

    await page.getByTestId("composer-post").click();
    await expect(page.getByTestId("post-image-attachments")).toHaveCount(0);
    const saved = await prisma.post.findFirstOrThrow({ where: { userId, body: `Com descrição ${TAG}` } });
    expect(saved.imageAlts).toEqual([DESCRIPTION, ""]);

    const card = page.getByTestId(`post-card-${saved.id}`);
    await expect(card.getByRole("img", { name: DESCRIPTION })).toBeVisible();
    await card.getByRole("button", { name: "Ver a descrição da imagem" }).click();
    await expect(page.getByRole("dialog", { name: "Descrição da imagem" }).getByTestId("image-alt-text")).toHaveText(DESCRIPTION);
    await page.keyboard.press("Escape");
    // A segunda imagem não tem descrição: sem selo.
    await card.getByRole("button", { name: "Próxima imagem" }).click();
    await expect(card.getByTestId("image-alt-badge")).toHaveCount(0);
  });

  test("a API valida a descrição e esconde-a com spoiler, como a imagem", async ({ request }) => {
    const image = "https://s4.anilist.co/file/anilistcdn/media/anime/cover-139.jpg";
    const long = await request.post("/api/posts", { data: { body: `Longa ${TAG}`, imageUrls: [image], imageAlts: ["x".repeat(1001)] } });
    expect(long.status()).toBe(400);
    expect((await long.json()).error).toContain("1000");
    expect((await request.post("/api/posts", { data: { body: `Tipo ${TAG}`, imageUrls: [image], imageAlts: [42] } })).status()).toBe(400);

    const spoiler = await request.post("/api/posts", { data: { body: `Spoiler ${TAG}`, imageUrls: [image], imageAlts: ["Cena final"], isSpoiler: true } });
    expect(spoiler.status()).toBe(201);
    const post = (await spoiler.json()).post;
    expect(post).toMatchObject({ imageUrls: [], imageAlts: [] });
    const revealed = await (await request.get(`/api/posts/${post.id}/reveal`)).json();
    expect(revealed).toMatchObject({ imageUrls: [image], imageAlts: ["Cena final"] });

    // Sem descrição enviada: "" para cada imagem.
    const plain = await (await request.post("/api/posts", { data: { body: `Sem ${TAG}`, imageUrls: [image, image] } })).json();
    expect(plain.post.imageAlts).toEqual(["", ""]);
  });

  test("a descrição vai junto da imagem para o editor completo", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("textbox", { name: "O que está acontecendo?" }).click();
    await clearImages(page);
    await page.getByTestId("composer-image-input").setInputFiles(await png(220));
    await expect(page.locator('[data-testid="post-image-attachment"][data-status="done"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Descrever a imagem 1" }).click();
    await page.getByRole("dialog", { name: "Descrever imagem 1" }).getByLabel("Descrição").fill(`Pôster ${TAG}`);
    await page.getByRole("button", { name: "Salvar descrição" }).click();
    await page.getByRole("link", { name: "Abrir editor completo" }).click();
    await expect(page).toHaveURL(/\/publicar$/);
    await expect(page.getByRole("button", { name: "Editar a descrição da imagem 1" })).toBeVisible();
    await page.getByRole("button", { name: "Editar a descrição da imagem 1" }).click();
    await expect(page.getByRole("dialog", { name: "Descrever imagem 1" }).getByLabel("Descrição")).toHaveValue(`Pôster ${TAG}`);
    await page.getByRole("button", { name: "Cancelar" }).click();
    await clearImages(page);
  });
});
