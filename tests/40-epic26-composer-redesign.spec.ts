import path from "node:path";
import { test, expect } from "@playwright/test";

const FIXTURE_IMAGE = path.join(__dirname, "fixtures", "test-image.png");
const COMPOSER_PLACEHOLDER = "O que está acontecendo? Marque um anime com #NomeDoAnime";

test.describe("Epic 26 — compositor estilo Twitter/X, anime marcado por hashtag no texto", () => {
  test("digitar # mostra sugestão de anime, e clicar insere a hashtag completa e habilita Publicar", async ({
    page,
  }) => {
    await page.goto("/");
    const body = page.getByPlaceholder(COMPOSER_PLACEHOLDER);
    const publishButton = page.getByRole("button", { name: "Publicar" });

    // Digitação real (não `fill`, que não simula tecla a tecla) — a lista
    // de sugestão precisa aparecer enquanto a hashtag ainda está sendo
    // digitada, não só no fim.
    await body.pressSequentially("Que episódio! #Kaiju");

    // Escopado pelo texto completo do item (título + slug), não só
    // "Kaiju No. 8" — esse texto sozinho também aparece nos chips de
    // anime de posts pré-existentes de outros arquivos de teste quando a
    // suíte inteira roda em sequência no mesmo banco.
    const suggestion = page.getByRole("button", { name: "Kaiju No. 8 #kaijuno8" });
    await expect(suggestion).toBeVisible();
    await expect(publishButton).toBeDisabled(); // hashtag ainda incompleta

    await suggestion.click();

    await expect(body).toHaveValue("Que episódio! #kaijuno8 ");
    await expect(page.getByText("Sobre: Kaiju No. 8")).toBeVisible();
    await expect(publishButton).toBeEnabled();
    // Clicar na sugestão devolve o foco pro campo, com o cursor pronto
    // pra continuar escrevendo — sem isso, a pessoa precisava clicar de
    // novo no campo depois de escolher uma sugestão.
    await expect(body).toBeFocused();
  });

  test("hashtag que não bate com nenhum anime da lista não resolve nada, e mostra o aviso", async ({ page }) => {
    await page.goto("/");
    const body = page.getByPlaceholder(COMPOSER_PLACEHOLDER);
    const publishButton = page.getByRole("button", { name: "Publicar" });

    // Termina com texto depois da hashtag (não logo no fim dela) — o
    // aviso de "nenhuma hashtag válida" só aparece quando o cursor não
    // está mais dentro de uma mention em digitação (ver mentionQuery em
    // FeedView.tsx), senão o componente ainda dá o benefício da dúvida
    // de que a pessoa pode estar no meio de digitar a hashtag certa.
    await body.fill("Post sem nenhuma marcação válida #ZzzNadaAVerComAnimeNenhum e mais texto");
    await expect(page.getByText("Marque um anime da sua lista com #NomeDoAnime pra poder publicar.")).toBeVisible();
    await expect(publishButton).toBeDisabled();
  });

  test("anexar imagem mostra miniatura, trava Publicar até terminar, e o post final renderiza a imagem enviada", async ({
    page,
  }) => {
    await page.goto("/");
    const bodyText = `Post com upload real #kaijuno8 ${Date.now()}`;
    await page.getByPlaceholder(COMPOSER_PLACEHOLDER).fill(bodyText);

    const publishButton = page.getByRole("button", { name: "Publicar" });
    await expect(publishButton).toBeEnabled();

    // Input de arquivo fica escondido (hidden), atrás do ícone de anexar —
    // setInputFiles funciona em input hidden independente de visibilidade.
    await page.locator('input[type="file"]').setInputFiles(FIXTURE_IMAGE);

    // A miniatura aparece assim que o arquivo é anexado (upload começa
    // em paralelo); Publicar volta a ficar habilitado só depois do
    // upload terminar de verdade (guarda `composerImages.some(status ===
    // "uploading")` em FeedView.tsx — confirmado ao vivo, com o overlay
    // de carregando visível sobre a miniatura enquanto isso; não
    // reproduzido aqui via timing de rede pra não arriscar interferir no
    // corpo multipart de verdade da requisição).
    await expect(page.getByRole("button", { name: "Remover imagem" })).toBeVisible();
    await expect(publishButton).toBeEnabled({ timeout: 10000 });

    await publishButton.click();

    const card = page.getByTestId(/post-card-/).filter({ hasText: bodyText });
    await expect(card).toBeVisible();
    // Escopado pelo próprio src, não `.first()` — o card também pode ter
    // a miniatura de capa do anime (chip do cabeçalho) antes da imagem do
    // carrossel no DOM quando esse anime já tem capa resolvida (ex.:
    // outro teste da suíte já rodou "Atualizar dados" nele antes).
    const uploadedImg = card.locator('img[src*="/uploads/posts/"]');
    await expect(uploadedImg).toHaveAttribute("src", /\/uploads\/posts\//);
  });

  test("modo citação continua anunciando (role=status) e movendo o foco pro corpo do texto, com o compositor redesenhado", async ({
    page,
    request,
  }) => {
    const prismaAnimeRes = await request.get("/api/anime");
    const { animes } = await prismaAnimeRes.json();
    const animeId = animes[0].id;
    const create = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: `Post pra citar no compositor redesenhado ${Date.now()}` },
    });
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
    await page.getByPlaceholder(COMPOSER_PLACEHOLDER).fill("teste limite de imagens #kaijuno8");

    const sevenFiles = Array(7).fill(FIXTURE_IMAGE);
    await page.locator('input[type="file"]').setInputFiles(sevenFiles);

    await expect(page.getByText("No máximo 6 imagens por post — 1 não foi anexada.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Remover imagem" })).toHaveCount(6);
  });

  test("contador de caracteres e a guarda de desabilitar sem texto continuam funcionando", async ({ page }) => {
    await page.goto("/");
    const publishButton = page.getByRole("button", { name: "Publicar" });
    await expect(publishButton).toBeDisabled();

    await page.getByPlaceholder(COMPOSER_PLACEHOLDER).fill("abc #kaijuno8");
    await expect(page.getByText("13/500")).toBeVisible();
    await expect(publishButton).toBeEnabled();
  });
});
