import path from "node:path";
import { test, expect } from "@playwright/test";

const FIXTURE_IMAGE = path.join(__dirname, "fixtures", "test-image.png");
const COMPOSER_PLACEHOLDER = "Que conversa você quer começar?";

// Compositor estilo Twitter/X (Epic 26), revisado no F8: a obra é um contexto
// OPCIONAL e EXPLÍCITO ("Anime relacionado"); hashtag no texto não associa
// nada e publicar não exige ter o anime na lista (Figma 13:41840).
test.describe("Epic 26 — compositor (contexto de obra opcional e explícito)", () => {
  test("o seletor de anime relacionado associa SÓ quando a pessoa escolhe, e o chip é removível", async ({ page }) => {
    // Busca mockada: o teste não depende da rede da AniList.
    await page.route("**/api/anilist/search*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          results: [{ anilistId: 904444, titleRomaji: "Kaiju No. 8", titleEnglish: "Kaiju No. 8", titleNative: "怪獣8号" }],
        }),
      })
    );
    await page.goto("/");
    const picker = page.getByLabel("Anime relacionado (opcional)");
    await picker.fill("Kaiju");
    await page.getByRole("option", { name: "Kaiju No. 8" }).click();

    const chip = page.getByTestId("related-anime-chip");
    await expect(chip).toContainText("Sobre: Kaiju No. 8");
    await chip.getByLabel("Remover associação").click();
    await expect(page.getByTestId("related-anime-chip")).toHaveCount(0);
    await expect(page.getByLabel("Anime relacionado (opcional)")).toBeVisible();
  });

  test("hashtag no texto não resolve nem exige nada: Publicar só depende de haver texto", async ({ page }) => {
    await page.goto("/");
    const body = page.getByPlaceholder(COMPOSER_PLACEHOLDER);
    const publishButton = page.getByRole("button", { name: "Publicar", exact: true });
    await expect(publishButton).toBeDisabled();

    await body.fill("Post com #ZzzNadaAVerComAnimeNenhum e mais texto");
    await expect(publishButton).toBeEnabled();
    await expect(page.getByText(/pra poder publicar/)).toHaveCount(0);
    await expect(page.getByTestId("related-anime-chip")).toHaveCount(0);
  });

  test("anexar imagem mostra miniatura, trava Publicar até terminar, e o post final renderiza a imagem enviada", async ({
    page,
  }) => {
    await page.goto("/");
    const bodyText = `Post com upload real ${Date.now()}`;
    await page.getByPlaceholder(COMPOSER_PLACEHOLDER).fill(bodyText);

    const publishButton = page.getByRole("button", { name: "Publicar", exact: true });
    await expect(publishButton).toBeEnabled();

    // Input de arquivo fica escondido (hidden), atrás do ícone de anexar —
    // setInputFiles funciona em input hidden independente de visibilidade.
    await page.locator('input[type="file"]').setInputFiles(FIXTURE_IMAGE);

    // A miniatura aparece assim que o arquivo é anexado (upload começa em
    // paralelo); Publicar volta a ficar habilitado só depois do upload
    // terminar de verdade (guarda `composerImages.some(status ===
    // "uploading")` em FeedView.tsx).
    await expect(page.getByRole("button", { name: "Remover imagem" })).toBeVisible();
    await expect(publishButton).toBeEnabled({ timeout: 10000 });

    await publishButton.click();

    const card = page.getByTestId(/post-card-/).filter({ hasText: bodyText });
    await expect(card).toBeVisible();
    const uploadedImg = card.locator('img[src*="/uploads/posts/"]');
    await expect(uploadedImg).toHaveAttribute("src", /\/uploads\/posts\//);
  });

  test("modo citação continua anunciando (role=status) e movendo o foco pro corpo do texto", async ({ page, request }) => {
    const create = await request.post("/api/posts", { data: { body: `Post pra citar no compositor ${Date.now()}` } });
    const postId = (await create.json()).post.id;

    await page.goto("/");
    const card = page.getByTestId(`post-card-${postId}`);
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Citar" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Citando post de" })).toBeVisible();
    await expect(page.getByPlaceholder(COMPOSER_PLACEHOLDER)).toBeFocused();

    await request.delete(`/api/posts/${postId}`);
  });

  // Achado real da revisão de código desta entrega: selecionar mais
  // arquivos do que o espaço restante descartava o excesso em silêncio.
  test("selecionar mais imagens do que o espaço restante avisa quantas não foram anexadas", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder(COMPOSER_PLACEHOLDER).fill("teste limite de imagens");

    const sevenFiles = Array(7).fill(FIXTURE_IMAGE);
    await page.locator('input[type="file"]').setInputFiles(sevenFiles);

    await expect(page.getByText("No máximo 6 imagens por post — 1 não foi anexada.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remover imagem" })).toHaveCount(6);
  });

  test("contador de caracteres e a guarda de desabilitar sem texto continuam funcionando", async ({ page }) => {
    await page.goto("/");
    const publishButton = page.getByRole("button", { name: "Publicar", exact: true });
    await expect(publishButton).toBeDisabled();

    await page.getByPlaceholder(COMPOSER_PLACEHOLDER).fill("abc #kaijuno8");
    await expect(page.getByText("13/500")).toBeVisible();
    await expect(publishButton).toBeEnabled();
  });
});
