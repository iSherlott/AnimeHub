import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// F7b/F7c (D-10, D-16; Figma 13:43571): bloqueio bidirecional e denúncias com
// motivo para publicação, resposta e perfil. A = usuário padrão da suíte;
// B = o admin de teste, usado como "outra pessoa".
const B_COOKIE = { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` };
const MARK = "MARCA-BLOQUEIO-98765";

test.describe("Bloqueio e denúncias", () => {
  let prisma: PrismaClient;
  let aId: string;
  let bId: string;
  let aAnimeId: string;
  let bAnimeId: string;
  let bPostId: string;
  let aPostId: string;

  async function asB(request: APIRequestContext, method: "get" | "post" | "put" | "patch" | "delete", url: string, data?: unknown) {
    return request[method](url, { headers: B_COOKIE, ...(data !== undefined ? { data } : {}) });
  }

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    const a = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } });
    const b = await prisma.user.findUniqueOrThrow({ where: { email: "e2e-admin@test.local" } });
    aId = a.id;
    bId = b.id;
    const aAnime = await prisma.anime.findFirstOrThrow({ where: { userId: aId } });
    aAnimeId = aAnime.id;
    const bAnime = await prisma.anime.upsert({
      where: { userId_anilistId: { userId: bId, anilistId: aAnime.anilistId as number } },
      create: { userId: bId, anilistId: aAnime.anilistId, titleRomaji: aAnime.titleRomaji },
      update: {},
    });
    bAnimeId = bAnime.id;
  });

  test.beforeEach(async ({ request }) => {
    await prisma.block.deleteMany({});
    await prisma.follow.deleteMany({ where: { OR: [{ followerId: aId }, { followerId: bId }] } });
    const bPost = await asB(request, "post", `/api/anime/${bAnimeId}/posts`, { body: `${MARK} post de B` });
    bPostId = (await bPost.json()).post.id;
    const aPost = await request.post(`/api/anime/${aAnimeId}/posts`, { data: { body: "post de A para os testes" } });
    aPostId = (await aPost.json()).post.id;
  });

  test.afterEach(async ({ request }) => {
    await prisma.block.deleteMany({});
    await asB(request, "delete", `/api/posts/${bPostId}`);
    await request.delete(`/api/posts/${aPostId}`);
  });

  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test("bloquear esconde o bloqueado nas listas de A e A nas de B, e desfaz o seguir", async ({ request }) => {
    await request.patch(`/api/users/${bId}/follow`, { data: { following: true } });
    await asB(request, "patch", `/api/users/${aId}/follow`, { following: true });

    const blocked = await request.put(`/api/users/${bId}/block`);
    expect(blocked.status()).toBe(200);
    expect(await prisma.follow.count({ where: { OR: [{ followerId: aId, followingId: bId }, { followerId: bId, followingId: aId }] } })).toBe(0);

    // A não vê B em lugar nenhum
    for (const url of ["/api/posts?tab=recommended", "/api/feed/trending-posts"]) {
      expect(await (await request.get(url)).text(), url).not.toContain(MARK);
    }
    expect((await request.get(`/api/users/${bId}`)).status()).toBe(404);
    expect((await request.get(`/api/users/${bId}/posts`)).status()).toBe(404);

    // B não vê A (mensagem neutra, igual a "não existe")
    expect((await asB(request, "get", `/api/users/${aId}`)).status()).toBe(404);
    const bFeed = await (await asB(request, "get", "/api/posts?tab=recommended")).json();
    expect((bFeed.posts as Array<{ id: string }>).some((p) => p.id === aPostId)).toBe(false);
  });

  test("o bloqueado não consegue seguir, curtir, comentar nem repostar o post de quem bloqueou", async ({ request }) => {
    await request.put(`/api/users/${bId}/block`);

    expect((await asB(request, "patch", `/api/users/${aId}/follow`, { following: true })).status()).toBe(404);
    expect((await asB(request, "patch", `/api/posts/${aPostId}/like`, { liked: true })).status()).toBe(404);
    expect((await asB(request, "post", `/api/posts/${aPostId}/comments`, { body: "oi" })).status()).toBe(404);
    expect((await asB(request, "patch", `/api/posts/${aPostId}/repost`, { reposted: true })).status()).toBe(404);
    expect((await asB(request, "get", `/api/posts/${aPostId}/comments`)).status()).toBe(404);
  });

  test("respostas de quem foi bloqueado somem da thread de A", async ({ request }) => {
    const reply = await asB(request, "post", `/api/posts/${aPostId}/comments`, { body: `${MARK} resposta de B` });
    expect(reply.status()).toBe(201);
    expect(await (await request.get(`/api/posts/${aPostId}/comments`)).text()).toContain(MARK);

    await request.put(`/api/users/${bId}/block`);
    expect(await (await request.get(`/api/posts/${aPostId}/comments`)).text()).not.toContain(MARK);
  });

  test("bloquear é idempotente, não pode ser a si mesmo e desbloquear NÃO volta a seguir", async ({ request }) => {
    expect((await request.put(`/api/users/${aId}/block`)).status()).toBe(400);
    expect((await request.put(`/api/users/${bId}/block`)).status()).toBe(200);
    expect((await request.put(`/api/users/${bId}/block`)).status()).toBe(200);
    expect(await prisma.block.count()).toBe(1);

    expect((await request.delete(`/api/users/${bId}/block`)).status()).toBe(200);
    expect((await request.get(`/api/users/${bId}`)).status()).toBe(200);
    expect(await prisma.follow.count({ where: { followerId: aId, followingId: bId } })).toBe(0);
  });

  test("na tela: A bloqueia B pelo menu com confirmação, vê 'Este perfil está bloqueado' e desbloqueia", async ({ page }) => {
    await page.goto(`/users/${bId}`);
    await page.getByRole("button", { name: "Denunciar / bloquear" }).click();
    await page.getByRole("menuitem", { name: "Bloquear perfil" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("As interações deste perfil deixarão de aparecer para você");
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    expect(await prisma.block.count()).toBe(0);

    await page.getByRole("button", { name: "Denunciar / bloquear" }).click();
    await page.getByRole("menuitem", { name: "Bloquear perfil" }).click();
    await page.getByTestId("block-confirm").click();

    const notice = page.getByTestId("blocked-profile");
    await expect(notice).toContainText("Este perfil está bloqueado");
    await expect(page.getByText(MARK)).toHaveCount(0);

    await notice.getByRole("button", { name: "Desbloquear perfil" }).click();
    await page.getByTestId("unblock-confirm").click();
    await expect(page.getByTestId("blocked-profile")).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("quem foi bloqueado abre o perfil e vê só 'não encontrado' neutro", async ({ browser }) => {
    await prisma.block.create({ data: { blockerId: aId, blockedId: bId } });
    const context = await browser.newContext({
      storageState: {
        cookies: [{ name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/", expires: -1, httpOnly: true, secure: false, sameSite: "Lax" }],
        origins: [],
      },
    });
    const page = await context.newPage();
    const res = await page.goto(`/users/${aId}`);
    expect(res?.status()).toBe(404);
    await context.close();
  });

  test("citação de um post apagado/bloqueado vira o tombstone neutro, sem texto nem autor", async ({ request }) => {
    const quote = await asB(request, "post", `/api/anime/${bAnimeId}/posts`, { body: "B cita A", quotedPostId: aPostId });
    expect(quote.status()).toBe(201);
    const quoteId = (await quote.json()).post.id;

    await request.delete(`/api/posts/${aPostId}`);
    const feed = await (await asB(request, "get", "/api/posts?tab=recommended")).json();
    const item = (feed.posts as Array<{ id: string; quotedPost: unknown; quotedUnavailable: boolean }>).find((p) => p.id === quoteId);
    expect(item).toMatchObject({ quotedPost: null, quotedUnavailable: true });
    await asB(request, "delete", `/api/posts/${quoteId}`);
  });

  test.describe("denúncias com motivo", () => {
    test("denunciar resposta e perfil exige motivo válido; é idempotente e não bloqueia ninguém", async ({ request }) => {
      const reply = await asB(request, "post", `/api/posts/${aPostId}/comments`, { body: "resposta denunciável" });
      const commentId = (await reply.json()).comment.id;
      const url = `/api/posts/${aPostId}/comments/${commentId}/report`;

      expect((await request.post(url, { data: {} })).status()).toBe(400);
      expect((await request.post(url, { data: { reason: "INVENTADO" } })).status()).toBe(400);
      expect((await request.post(url, { data: { reason: "UNMARKED_SPOILER" } })).status()).toBe(201);
      expect((await request.post(url, { data: { reason: "SPAM" } })).status()).toBe(201);
      expect(await prisma.postCommentReport.count({ where: { commentId } })).toBe(1);

      expect((await request.post(`/api/users/${bId}/report`, { data: { reason: "HARASSMENT" } })).status()).toBe(201);
      expect((await request.post(`/api/users/${bId}/report`, { data: {} })).status()).toBe(400);
      expect((await request.post(`/api/users/${aId}/report`, { data: { reason: "SPAM" } })).status()).toBe(400);
      expect(await prisma.block.count()).toBe(0); // denunciar NÃO bloqueia

      // admin enxerga as filas com motivos e resolve
      const queue = await (await asB(request, "get", "/api/admin/post-comment-reports")).json();
      expect(queue.reports.find((r: { commentId: string }) => r.commentId === commentId)).toMatchObject({ reasons: ["SPAM"] });
      const profileQueue = await (await asB(request, "get", "/api/admin/user-reports")).json();
      expect(profileQueue.reports.find((r: { userId: string }) => r.userId === bId)).toBeTruthy();

      const removed = await asB(request, "post", `/api/admin/post-comment-reports/${commentId}/resolve`, { action: "remove" });
      expect(removed.status()).toBe(200);
      expect(await (await request.get(`/api/posts/${aPostId}/comments`)).text()).not.toContain("resposta denunciável");
      expect((await asB(request, "post", `/api/admin/user-reports/${bId}/resolve`)).status()).toBe(200);
    });

    test("denúncia de post aceita motivo; motivo inválido é rejeitado; sem corpo continua valendo (OTHER)", async ({ request }) => {
      const url = `/api/posts/${bPostId}/report`;
      expect((await request.post(url, { data: { reason: "XYZ" } })).status()).toBe(400);
      expect((await request.post(url, { data: { reason: "HARASSMENT" } })).status()).toBe(201);
      expect((await prisma.postReport.findFirstOrThrow({ where: { postId: bPostId, reporterId: aId } })).reason).toBe("HARASSMENT");
      await prisma.postReport.deleteMany({ where: { postId: bPostId } });
      expect((await request.post(url)).status()).toBe(201);
      expect((await prisma.postReport.findFirstOrThrow({ where: { postId: bPostId, reporterId: aId } })).reason).toBe("OTHER");
    });

    test("não-admin não acessa as novas filas", async ({ request }) => {
      expect((await request.get("/api/admin/post-comment-reports")).status()).toBe(403);
      expect((await request.get("/api/admin/user-reports")).status()).toBe(403);
    });

    test("na tela: motivo obrigatório, confirmação e retorno discreto ao denunciar um post", async ({ page }) => {
      await page.goto("/");
      const card = page.getByTestId(`post-card-${bPostId}`);
      await card.getByRole("button", { name: "Denunciar", exact: true }).click();

      const dialog = page.getByRole("dialog");
      await expect(dialog.getByTestId("report-continue")).toBeDisabled();
      await dialog.getByLabel("Spoiler sem aviso").check();
      await dialog.getByTestId("report-continue").click();
      await expect(dialog).toContainText("Sua identidade não será publicada");
      await expect(dialog).toContainText("Denunciar não bloqueia automaticamente o perfil");
      await dialog.getByTestId("report-send").click();

      await expect(page.getByText("Denúncia enviada.")).toBeVisible();
      await expect(card.getByRole("button", { name: "Denunciado" })).toBeDisabled();
      expect((await prisma.postReport.findFirstOrThrow({ where: { postId: bPostId, reporterId: aId } })).reason).toBe("UNMARKED_SPOILER");
      await prisma.postReport.deleteMany({ where: { postId: bPostId } });
    });
  });
});
