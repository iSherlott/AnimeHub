import { test, expect } from "@playwright/test";

const COMPOSER_PLACEHOLDER = "Que conversa você quer começar?";

// Editor "Nova publicação" (Figma 13:41840, antes o compositor inline do Feed): a obra é
// um contexto OPCIONAL e EXPLÍCITO ("Anime relacionado"); hashtag no texto não associa
// nada e publicar não exige ter o anime na lista. V1 somente texto (sem anexos).
test.describe("Nova publicação — contexto de obra opcional e explícito", () => {
  test("o seletor de anime relacionado associa SÓ quando a pessoa escolhe, e a associação é removível", async ({ page }) => {
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
    await page.goto("/publicar");
    const picker = page.getByLabel("Buscar e associar um anime");
    await picker.fill("Kaiju");
    await page.getByRole("option", { name: "Kaiju No. 8" }).click();

    const chip = page.getByTestId("related-anime-chip");
    await expect(chip).toContainText("Sobre: Kaiju No. 8");
    await chip.getByRole("button", { name: "Remover associação" }).click();
    await expect(page.getByTestId("related-anime-chip")).toHaveCount(0);
    await expect(page.getByLabel("Buscar e associar um anime")).toBeVisible();
  });

  test("hashtag no texto não resolve nem exige nada: Publicar só depende de haver texto", async ({ page }) => {
    await page.goto("/publicar");
    const body = page.getByPlaceholder(COMPOSER_PLACEHOLDER);
    const publishButton = page.getByRole("button", { name: "Publicar", exact: true });
    await expect(publishButton).toBeDisabled();

    await body.fill("Post com #ZzzNadaAVerComAnimeNenhum e mais texto");
    await expect(publishButton).toBeEnabled();
    await expect(page.getByTestId("related-anime-chip")).toHaveCount(0);
  });

  test("é somente texto na V1: não há anexo de imagem", async ({ page }) => {
    await page.goto("/publicar");
    await expect(page.getByRole("button", { name: "Anexar imagem" })).toHaveCount(0);
    await expect(page.locator('input[type="file"]')).toHaveCount(0);
  });

  test("modo citação anuncia (role=status) e foca o corpo do texto", async ({ page, request }) => {
    const create = await request.post("/api/posts", { data: { body: `Post pra citar no editor ${Date.now()}` } });
    const postId = (await create.json()).post.id;

    await page.goto("/");
    const card = page.getByTestId(`post-card-${postId}`);
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Compartilhar internamente" }).click();
    await page.getByRole("menuitem", { name: "Citar publicação" }).click();

    await expect(page).toHaveURL(/\/publicar\?.*quotePostId=/);
    await expect(page.getByRole("status").filter({ hasText: "Citando publicação de" })).toBeVisible();
    await expect(page.getByPlaceholder(COMPOSER_PLACEHOLDER)).toBeFocused();

    await request.delete(`/api/posts/${postId}`);
  });

  test("contador de caracteres e a guarda de desabilitar sem texto continuam funcionando", async ({ page }) => {
    await page.goto("/publicar");
    const publishButton = page.getByRole("button", { name: "Publicar", exact: true });
    await expect(publishButton).toBeDisabled();

    await page.getByPlaceholder(COMPOSER_PLACEHOLDER).fill("abc #kaijuno8");
    await expect(page.getByText("13/500 caracteres")).toBeVisible();
    await expect(publishButton).toBeEnabled();
  });

  test("hashtags do campo próprio entram no post (com sugestão e sem duplicata) e o limite de 5 é respeitado", async ({ page, request }) => {
    await page.goto("/publicar");
    const text = `Post com hashtags do campo ${Date.now()}`;
    await page.getByPlaceholder(COMPOSER_PLACEHOLDER).fill(text);
    const tagInput = page.getByLabel("Adicionar hashtag");
    await tagInput.fill("DireçãoDeArte");
    await expect(page.getByText("#DireçãoDeArte · usar novo tema")).toBeVisible();
    await tagInput.press("Enter");
    await tagInput.fill("direçãodearte");
    await tagInput.press("Enter"); // mesma hashtag por caixa: sem duplicata
    await expect(page.getByRole("button", { name: /Remover #/ })).toHaveCount(1);

    await page.getByTestId("publish-send").click();
    await expect(page).toHaveURL(/\/publicacao\//);
    const id = page.url().split("/publicacao/")[1];
    const post = await (await request.get(`/api/posts/${id}`)).json();
    expect(post.post.body).toContain("#DireçãoDeArte");
    expect(post.post.body.split("#DireçãoDeArte").length).toBe(2);
    await request.delete(`/api/posts/${id}`);
  });
});
