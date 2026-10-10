import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// F8 (D-27, D-13; Figma 13:41840/13:41925/13:42257/13:42397/fluxo B e E):
// publicar com contexto de obra OPCIONAL e EXPLÍCITO, "Recentes", discussões
// por produção, respostas de um nível e página dedicada.
const PROD_ID = 907000;
const B_COOKIE = { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` };

test.describe("Publicar, Recentes e discussões", () => {
  let prisma: PrismaClient;
  const created: string[] = [];

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const franchise = await prisma.franchise.upsert({
      where: { rootAnilistId: PROD_ID },
      create: { rootAnilistId: PROD_ID, name: "Franquia Discussões" },
      update: {},
    });
    await prisma.production.upsert({
      where: { anilistId: PROD_ID },
      create: { anilistId: PROD_ID, franchiseId: franchise.id, titleRomaji: "Obra Das Discussoes", fetchedAt: new Date() },
      update: { fetchedAt: new Date() },
    });
    // O usuário de teste NÃO acompanha essa obra (publicar não exige acompanhar).
    const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    await prisma.anime.deleteMany({ where: { userId: user.id, anilistId: PROD_ID } });
  });

  test.afterEach(async ({ request }) => {
    for (const id of created.splice(0)) await request.delete(`/api/posts/${id}`);
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("publicar SEM obra funciona, e mencionar nome/hashtag no texto não cria associação", async ({ request }) => {
    const res = await request.post("/api/posts", { data: { body: "Quero descobrir um mistério #ObraDasDiscussoes sem contar as viradas" } });
    expect(res.status()).toBe(201);
    const post = (await res.json()).post;
    created.push(post.id);
    expect(post).toMatchObject({ anilistId: null, animeTitleRomaji: null, isSpoiler: false });
  });

  test("publicar sobre uma obra que NÃO está na minha lista, escolhida explicitamente", async ({ request }) => {
    const res = await request.post("/api/posts", { data: { body: "Primeira impressão da obra", anilistId: PROD_ID } });
    expect(res.status()).toBe(201);
    const post = (await res.json()).post;
    created.push(post.id);
    expect(post).toMatchObject({ anilistId: PROD_ID, animeTitleRomaji: "Obra Das Discussoes" });
  });

  test("validações: obra inválida, corpo vazio e sessão", async ({ request, playwright, baseURL }) => {
    expect((await request.post("/api/posts", { data: { body: "x", anilistId: "abc" } })).status()).toBe(400);
    expect((await request.post("/api/posts", { data: { body: "x", anilistId: -3 } })).status()).toBe(400);
    expect((await request.post("/api/posts", { data: { body: "   " } })).status()).toBe(400);
    expect((await request.post("/api/posts", { data: { body: "x".repeat(501) } })).status()).toBe(400);
    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await anon.post("/api/posts", { data: { body: "oi" } })).status()).toBe(401);
    await anon.dispose();
  });

  test("Recentes: cronológico global, com cursor e filtro por obra", async ({ request }) => {
    const ids: string[] = [];
    for (const [i, withAnime] of [[1, true], [2, false], [3, true]] as const) {
      const r = await request.post("/api/posts", { data: { body: `Recentes ${i}`, ...(withAnime ? { anilistId: PROD_ID } : {}) } });
      ids.push((await r.json()).post.id);
    }
    created.push(...ids);

    const all = await (await request.get("/api/posts?tab=recent&limit=50")).json();
    const order = (all.posts as Array<{ id: string }>).map((p) => p.id).filter((id) => ids.includes(id));
    expect(order).toEqual([ids[2], ids[1], ids[0]]); // mais nova primeiro

    const byWork = await (await request.get(`/api/posts?tab=recent&anilistId=${PROD_ID}&limit=50`)).json();
    const workIds = (byWork.posts as Array<{ id: string; anilistId: number }>).map((p) => p.id);
    expect(workIds).toContain(ids[0]);
    expect(workIds).toContain(ids[2]);
    expect(workIds).not.toContain(ids[1]);

    const page1 = await (await request.get(`/api/posts?tab=recent&anilistId=${PROD_ID}&limit=1`)).json();
    expect(page1.posts).toHaveLength(1);
    expect(page1.nextCursor).toBeTruthy();
    const page2 = await (await request.get(`/api/posts?tab=recent&anilistId=${PROD_ID}&limit=1&cursor=${page1.nextCursor}`)).json();
    expect(page2.posts[0].id).not.toBe(page1.posts[0].id);
  });

  test("no feed: aba Recentes existe e o compositor publica sem exigir obra", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("tab", { name: "Recentes" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Para você" })).toBeVisible();

    await page.getByRole("link", { name: "+ Nova publicação" }).click();
    await expect(page).toHaveURL(/\/publicar$/);

    const publish = page.getByRole("button", { name: "Publicar", exact: true });
    await expect(publish).toBeDisabled();
    const text = `Sem obra nenhuma ${Date.now()}`;
    await page.getByPlaceholder("Que conversa você quer começar?").fill(text);
    await expect(page.getByLabel("Buscar e associar um anime")).toBeVisible();
    await expect(publish).toBeEnabled();
    await publish.click();
    await expect(page).toHaveURL(/\/publicacao\//);
    await expect(page.getByText(text)).toBeVisible();

    const feed = await (await page.request.get("/api/posts?tab=recent&limit=5")).json();
    const mine = (feed.posts as Array<{ id: string; body: string }>).find((p) => p.body === text);
    if (mine) created.push(mine.id);
  });

  test.describe("detalhe público da obra", () => {
    test("visitante lê as discussões e vê 'Entre para publicar'", async ({ browser, request }) => {
      const r = await request.post("/api/posts", { data: { body: "Discussão visível ao visitante", anilistId: PROD_ID } });
      created.push((await r.json()).post.id);

      const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
      const page = await context.newPage();
      await page.goto(`/obra/${PROD_ID}`);
      const section = page.getByTestId("discussions");
      await expect(section).toContainText("Discussão visível ao visitante");
      const publishAbout = section.getByTestId("publish-about");
      await expect(publishAbout).toContainText("Publicar sobre este anime");
      // Visitante é levado ao login, com o destino (o editor) preservado.
      await publishAbout.click();
      await expect(page).toHaveURL(/\/login\?next=%2Fpublicar/);
      await context.close();
    });

    test("sem discussões mostra o convite exato", async ({ page, request }) => {
      // Garante lista vazia para esta obra.
      const feed = await (await request.get(`/api/posts?tab=recent&anilistId=${PROD_ID}&limit=50`)).json();
      for (const p of feed.posts as Array<{ id: string; isMine: boolean }>) if (p.isMine) await request.delete(`/api/posts/${p.id}`);
      await page.route("**/api/posts?*anilistId=*", async (route) => {
        await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ posts: [], nextCursor: null }) });
      });
      await page.goto(`/obra/${PROD_ID}`);
      await expect(page.getByText("Esta obra ainda não tem discussões. Seja a primeira pessoa a compartilhar uma impressão.")).toBeVisible();
    });

    test("'Publicar sobre este anime': produção pré-selecionada, rascunho, descarte e publicação", async ({ page }) => {
      await page.goto(`/obra/${PROD_ID}`);
      await page.getByTestId("publish-about").click();
      await expect(page).toHaveURL(new RegExp(`/publicar\\?anilistId=${PROD_ID}`));

      // Produção pré-selecionada a partir do detalhe, removível.
      await expect(page.getByTestId("related-anime-chip")).toContainText("Selecionado a partir do detalhe");
      await expect(page.getByTestId("publish-send")).toBeDisabled();

      const field = page.getByLabel("Sua publicação");
      await field.fill("Rascunho que não quero perder");
      await page.getByRole("button", { name: "Cancelar", exact: true }).click();
      const confirm = page.getByRole("dialog", { name: "Descartar este rascunho?" });
      await expect(confirm).toBeVisible();
      await confirm.getByRole("button", { name: "Continuar escrevendo" }).click();
      await expect(field).toHaveValue("Rascunho que não quero perder");

      await field.fill(`Publicado pelo detalhe ${Date.now()}`);
      await page.getByTestId("publish-send").click();
      await expect(page).toHaveURL(/\/publicacao\//);
      await page.goto(`/obra/${PROD_ID}`);
      await expect(page.getByTestId("discussions")).toContainText("Publicado pelo detalhe");

      const feed = await (await page.request.get(`/api/posts?tab=recent&anilistId=${PROD_ID}&limit=5`)).json();
      const mine = (feed.posts as Array<{ id: string; body: string; anilistId: number }>).find((p) => p.body.startsWith("Publicado pelo detalhe"));
      expect(mine?.anilistId).toBe(PROD_ID);
      if (mine) created.push(mine.id);
      // publicar NÃO criou vínculo de acompanhamento
      const user = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
      expect(await prisma.anime.count({ where: { userId: user.id, anilistId: PROD_ID } })).toBe(0);
    });

    test("falha ao publicar mantém texto e oferece tentar de novo", async ({ page }) => {
      await page.route("**/api/posts", async (route) => {
        if (route.request().method() === "POST") await route.fulfill({ status: 500, body: "{}" });
        else await route.continue();
      });
      await page.goto(`/publicar?anilistId=${PROD_ID}`);
      await page.getByLabel("Sua publicação").fill("Texto que deve sobreviver à falha");
      await page.getByTestId("publish-send").click();
      await expect(page.getByRole("alert").filter({ hasText: "Não foi possível publicar" })).toContainText("Texto, associação e escolha de spoilers foram mantidos");
      await expect(page.getByLabel("Sua publicação")).toHaveValue("Texto que deve sobreviver à falha");
      await expect(page.getByTestId("related-anime-chip")).toBeVisible();
    });
  });

  test.describe("respostas de um nível e página dedicada", () => {
    let postId: string;

    test.beforeEach(async ({ request }) => {
      const r = await request.post("/api/posts", { data: { body: "Post para threads", anilistId: PROD_ID } });
      postId = (await r.json()).post.id;
      created.push(postId);
    });

    test("responder a uma resposta mantém UM nível e registra 'Em resposta a'", async ({ request }) => {
      const top = (await (await request.post(`/api/posts/${postId}/comments`, { data: { body: "resposta de topo" } })).json()).comment;
      expect(top).toMatchObject({ parentId: null, replyTo: null });

      const bReply = await request.post(`/api/posts/${postId}/comments`, { headers: B_COOKIE, data: { body: "filha de B", parentId: top.id } });
      expect(bReply.status()).toBe(201);
      const child = (await bReply.json()).comment;
      expect(child.parentId).toBe(top.id);
      expect(child.replyTo.displayName).toBeTruthy();

      // responder à filha continua apontando para a resposta de topo
      const grand = (await (await request.post(`/api/posts/${postId}/comments`, { data: { body: "neta", parentId: child.id } })).json()).comment;
      expect(grand.parentId).toBe(top.id);
      expect(grand.replyTo.id).toBe(child.author.id);

      const list = await (await request.get(`/api/posts/${postId}/comments`)).json();
      expect((list.comments as Array<{ id: string }>).map((c) => c.id)).toEqual([top.id, child.id, grand.id]);

      // alvo inexistente / de outro post → 404
      expect((await request.post(`/api/posts/${postId}/comments`, { data: { body: "x", parentId: "nao-existe" } })).status()).toBe(404);
      expect((await request.post(`/api/posts/${postId}/comments`, { data: { body: "x", parentId: 123 } })).status()).toBe(400);
    });

    test("na página dedicada: respostas abertas, 'Responder' mostra o alvo e a resposta fica no thread certo", async ({ page, request }) => {
      const top = (await (await request.post(`/api/posts/${postId}/comments`, { data: { body: "pergunta da Bia" } })).json()).comment;
      await page.goto(`/publicacao/${postId}`);

      await expect(page.getByRole("heading", { level: 1, name: "Discussão" })).toBeVisible();
      await expect(page.getByText("Post para threads")).toBeVisible();
      await expect(page.getByTestId(`comment-${top.id}`)).toContainText("pergunta da Bia");

      await page.getByRole("button", { name: /Responder a/ }).first().click();
      await expect(page.getByTestId("replying-to")).toContainText("Em resposta a");
      await page.getByPlaceholder("Escreva uma resposta...").fill("minha resposta ao thread");
      await page.getByRole("button", { name: "Enviar resposta" }).click();

      const child = page.locator("[data-testid^='comment-']").filter({ hasText: "minha resposta ao thread" });
      await expect(child).toContainText("Em resposta a");
      await expect(page.getByTestId("replying-to")).toHaveCount(0);
    });

    test("post apagado vira 'Publicação removida' na página dedicada", async ({ page, request }) => {
      await request.delete(`/api/posts/${postId}`);
      await page.goto(`/publicacao/${postId}`);
      await expect(page.getByTestId("post-unavailable")).toContainText("Publicação removida");
      await expect(page.getByRole("link", { name: "Voltar à Comunidade", exact: true })).toBeVisible();
    });
  });
});
