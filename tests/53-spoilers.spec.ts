import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// F7a (P-12, Figma 13:41155/13:43079/fluxo F): spoiler marcado pelo AUTOR.
// O servidor nunca envia o texto nas listas — só pela rota de revelar.
const SECRET = "SEGREDO-DO-FINAL-DA-OBRA-12345";

test.describe("Spoilers (marca do autor, revelar por ação explícita)", () => {
  let animeId: string;
  let userId: string;
  let postId: string;

  test.beforeAll(async () => {
    const prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    userId = user.id;
    animeId = (await prisma.anime.findFirstOrThrow({ where: { userId } })).id;
    await prisma.$disconnect();
  });

  test.beforeEach(async ({ request }) => {
    const res = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: `${SECRET} com texto a esconder`, isSpoiler: true },
    });
    expect(res.status()).toBe(201);
    postId = (await res.json()).post.id;
  });

  test.afterEach(async ({ request }) => {
    await request.delete(`/api/posts/${postId}`);
  });

  test("as listas públicas NUNCA carregam o texto de um spoiler (feed, lateral, perfil)", async ({ request }) => {
    const created = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: `${SECRET} outro`, isSpoiler: true },
    });
    const createdPost = (await created.json()).post;
    expect(createdPost.isSpoiler).toBe(true);
    expect(createdPost.body).toBe("");
    expect(JSON.stringify(createdPost)).not.toContain(SECRET);

    for (const url of ["/api/posts?tab=recommended", "/api/feed/trending-posts", `/api/users/${userId}/posts`]) {
      const res = await request.get(url);
      expect(res.status(), url).toBe(200);
      expect(await res.text(), url).not.toContain(SECRET);
    }
    const feed = await (await request.get("/api/posts?tab=recommended")).json();
    const item = (feed.posts as Array<{ id: string; isSpoiler: boolean; body: string }>).find((p) => p.id === postId);
    expect(item).toMatchObject({ isSpoiler: true, body: "" });
    await request.delete(`/api/posts/${createdPost.id}`);
  });

  test("a rota de revelar devolve o texto; post apagado responde 404 neutro", async ({ request }) => {
    const reveal = await request.get(`/api/posts/${postId}/reveal`);
    expect(reveal.status()).toBe(200);
    expect((await reveal.json()).body).toContain(SECRET);

    await request.delete(`/api/posts/${postId}`);
    const gone = await request.get(`/api/posts/${postId}/reveal`);
    expect(gone.status()).toBe(404);
    expect(await gone.json()).toEqual({ error: "Conteúdo indisponível" });
  });

  test("na tela: aviso no lugar do texto; revelar mostra; 'Ocultar novamente' esconde de novo", async ({ page }) => {
    await page.goto("/");
    const notice = page.getByTestId("spoiler-notice").first();
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("Conteúdo com spoilers");
    await expect(page.getByText(SECRET)).toHaveCount(0);
    expect(await page.content()).not.toContain(SECRET);

    const revealButton = notice.getByRole("button", { name: "Revelar conteúdo (spoilers)" });
    await expect(revealButton).toHaveAttribute("aria-expanded", "false");
    await revealButton.click();

    const revealed = page.getByTestId("spoiler-revealed").first();
    await expect(revealed).toContainText(SECRET);

    await revealed.getByRole("button", { name: "Ocultar novamente" }).click();
    await expect(page.getByText(SECRET)).toHaveCount(0);
    await expect(page.getByTestId("spoiler-notice").first()).toBeVisible();
  });

  test("falha ao revelar mostra erro e NUNCA texto parcial", async ({ page }) => {
    await page.route("**/api/posts/*/reveal", (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.goto("/");
    const notice = page.getByTestId("spoiler-notice").first();
    await notice.getByRole("button", { name: "Revelar conteúdo (spoilers)" }).click();
    await expect(notice.getByRole("alert")).toContainText("Não foi possível carregar o conteúdo");
    await expect(page.getByText(SECRET)).toHaveCount(0);
  });

  test("citar um spoiler: a citação também esconde o texto", async ({ request }) => {
    const quote = await request.post(`/api/anime/${animeId}/posts`, {
      data: { body: "minha opinião sem spoiler", quotedPostId: postId },
    });
    expect(quote.status()).toBe(201);
    const quoted = (await quote.json()).post;
    expect(quoted.quotedPost).toMatchObject({ isSpoiler: true, body: "" });
    expect(JSON.stringify(quoted)).not.toContain(SECRET);
    await request.delete(`/api/posts/${quoted.id}`);
  });

  test("respostas: o autor marca spoiler, a lista oculta e só o revelar devolve o texto", async ({ request }) => {
    const created = await request.post(`/api/posts/${postId}/comments`, {
      data: { body: `${SECRET} na resposta`, isSpoiler: true },
    });
    expect(created.status()).toBe(201);
    const comment = (await created.json()).comment;
    expect(comment).toMatchObject({ isSpoiler: true, body: "" });

    const list = await request.get(`/api/posts/${postId}/comments`);
    expect(await list.text()).not.toContain(SECRET);

    const reveal = await request.get(`/api/posts/${postId}/comments/${comment.id}/reveal`);
    expect(reveal.status()).toBe(200);
    expect((await reveal.json()).body).toContain(SECRET);

    // revelar uma resposta não vale para outro post (id cruzado → 404)
    const cross = await request.get(`/api/posts/outro-post/comments/${comment.id}/reveal`);
    expect(cross.status()).toBe(404);

    const normal = await request.post(`/api/posts/${postId}/comments`, { data: { body: "comentário comum" } });
    expect((await normal.json()).comment).toMatchObject({ isSpoiler: false, body: "comentário comum" });
  });

  test("o compositor tem 'Contém spoilers' desmarcado por padrão", async ({ page }) => {
    await page.goto("/publicar");
    const checkbox = page.getByLabel("Contém spoilers").first();
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();
  });
});
