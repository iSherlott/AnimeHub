import { test, expect, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN, TEST_USER_EMAIL } from "./test-auth";

// F12 (NOTIF-001…003; Figma 13:43025): sino único com canais Lançamentos e
// Social, "Data alterada" com horário anterior, eventos sociais sem texto
// do conteúdo, preferências respeitadas, bloqueio, tombstone e "Marcar
// Social como lido".
const SUFFIX = Date.now().toString(36);
const SECRET = `finalsecreto${SUFFIX}`;
const ALERT_ANILIST_ID = 959001;

test.describe("Notificações: Lançamentos e Social", () => {
  let prisma: PrismaClient;
  let me: { id: string };
  let other: { id: string };
  let otherApi: APIRequestContext;
  const created: string[] = [];

  test.beforeAll(async ({ playwright, baseURL }) => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    me = await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL }, select: { id: true } });
    other = await prisma.user.findFirstOrThrow({ where: { role: "ADMIN" }, select: { id: true } });
    otherApi = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
  });

  test.beforeEach(async () => {
    await prisma.socialNotification.deleteMany({ where: { userId: me.id } });
    await prisma.user.update({
      where: { id: me.id },
      data: { notifyReplies: true, notifyComments: true, notifyFollowers: true, notifyLikes: false },
    });
  });

  test.afterEach(async ({ request }) => {
    for (const id of created.splice(0)) await request.delete(`/api/posts/${id}`);
    await otherApi.delete(`/api/users/${me.id}/block`).catch(() => undefined);
  });

  test.afterAll(async () => {
    await prisma.socialNotification.deleteMany({ where: { userId: me.id } });
    await prisma.airingAlert.deleteMany({ where: { userId: me.id, anilistId: ALERT_ANILIST_ID } });
    await prisma.user.update({
      where: { id: me.id },
      data: { notifyReplies: true, notifyComments: true, notifyFollowers: true, notifyLikes: false },
    });
    await prisma.$disconnect();
    await otherApi.dispose();
  });

  async function myPost(request: APIRequestContext) {
    const res = await request.post("/api/posts", { data: { body: `Minha publicação ${SUFFIX}` } });
    const id = (await res.json()).post.id as string;
    created.push(id);
    return id;
  }

  async function social(request: APIRequestContext) {
    return (await (await request.get("/api/notifications")).json()) as {
      social: Array<{ id: string; type: string; unavailable: boolean; href: string | null; readAt: string | null; actor: { id: string } }>;
      socialUnreadCount: number;
    };
  }

  test("resposta à publicação e ao comentário geram aviso SEM o texto (spoiler-safe) e com destino com âncora", async ({ request }) => {
    const postId = await myPost(request);
    const c1 = await otherApi.post(`/api/posts/${postId}/comments`, { data: { body: `Eu sei: ${SECRET}`, isSpoiler: true } });
    expect(c1.status()).toBe(201);

    // Minha resposta ao comentário do outro, que depois é respondida por ele.
    const mine = await request.post(`/api/posts/${postId}/comments`, { data: { body: "Sem spoilers, por favor" } });
    const mineId = (await mine.json()).comment.id as string;
    const reply = await otherApi.post(`/api/posts/${postId}/comments`, { data: { body: "Entendido", parentId: mineId } });
    const replyId = (await reply.json()).comment.id as string;

    const raw = await (await request.get("/api/notifications")).text();
    expect(raw).not.toContain(SECRET);
    const data = JSON.parse(raw) as Awaited<ReturnType<typeof social>>;
    const postReply = data.social.find((n) => n.type === "POST_REPLY");
    const commentReply = data.social.find((n) => n.type === "COMMENT_REPLY");
    expect(postReply?.href).toMatch(new RegExp(`^/publicacao/${postId}#comentario-`));
    expect(commentReply?.href).toBe(`/publicacao/${postId}#comentario-${replyId}`);
    expect(data.socialUnreadCount).toBeGreaterThanOrEqual(2);
  });

  test("novo seguidor avisa uma vez; curtida só com a preferência ligada", async ({ request }) => {
    expect((await otherApi.patch(`/api/users/${me.id}/follow`, { data: { following: true } })).status()).toBe(200);
    await otherApi.patch(`/api/users/${me.id}/follow`, { data: { following: false } });
    await otherApi.patch(`/api/users/${me.id}/follow`, { data: { following: true } });
    let data = await social(request);
    expect(data.social.filter((n) => n.type === "NEW_FOLLOWER")).toHaveLength(1);
    await otherApi.patch(`/api/users/${me.id}/follow`, { data: { following: false } });

    const postId = await myPost(request);
    await otherApi.patch(`/api/posts/${postId}/like`, { data: { liked: true } });
    data = await social(request);
    expect(data.social.some((n) => n.type === "POST_LIKE")).toBe(false);

    await prisma.user.update({ where: { id: me.id }, data: { notifyLikes: true } });
    await otherApi.patch(`/api/posts/${postId}/like`, { data: { liked: false } });
    await otherApi.patch(`/api/posts/${postId}/like`, { data: { liked: true } });
    data = await social(request);
    expect(data.social.filter((n) => n.type === "POST_LIKE")).toHaveLength(1);
  });

  test("preferência desligada não gera aviso; ações em si mesmo e com bloqueio também não", async ({ request }) => {
    await prisma.user.update({ where: { id: me.id }, data: { notifyReplies: false } });
    const postId = await myPost(request);
    await otherApi.post(`/api/posts/${postId}/comments`, { data: { body: "oi" } });
    await request.post(`/api/posts/${postId}/comments`, { data: { body: "eu mesmo" } });
    expect((await social(request)).social).toHaveLength(0);

    await prisma.user.update({ where: { id: me.id }, data: { notifyReplies: true } });
    expect((await request.put(`/api/users/${other.id}/block`)).status()).toBeLessThan(300);
    try {
      await otherApi.post(`/api/posts/${postId}/comments`, { data: { body: "bloqueado" } });
    } finally {
      await request.delete(`/api/users/${other.id}/block`);
    }
    expect((await social(request)).social).toHaveLength(0);
  });

  test("publicação apagada vira tombstone e 'Marcar Social como lido' não toca em Lançamentos", async ({ request }) => {
    const alert = await prisma.airingAlert.upsert({
      where: { userId_anilistId_episode: { userId: me.id, anilistId: ALERT_ANILIST_ID, episode: 3 } },
      create: { userId: me.id, anilistId: ALERT_ANILIST_ID, episode: 3, airingAt: new Date() },
      update: { seenAt: null },
    });
    const postId = await myPost(request);
    await otherApi.post(`/api/posts/${postId}/comments`, { data: { body: "oi" } });
    await request.delete(`/api/posts/${postId}`);

    const before = await social(request);
    expect(before.social[0]).toMatchObject({ unavailable: true, href: null });

    const all = await request.post("/api/notifications/social/read-all");
    expect(all.status()).toBe(200);
    const after = await social(request);
    expect(after.socialUnreadCount).toBe(0);
    const alerts = (await (await request.get("/api/notifications")).json()).alerts as Array<{ id: string; seenAt: string | null }>;
    expect(alerts.find((a) => a.id === alert.id)?.seenAt).toBeNull();

    const nid = before.social[0].id;
    expect((await otherApi.post(`/api/notifications/social/${nid}/read`)).status()).toBe(404);
    expect((await request.post(`/api/notifications/social/${nid}/read`)).status()).toBe(200);
  });

  test("UI: sino com dois canais, 'Data alterada' com horário anterior e destino na obra", async ({ page, request }) => {
    const airingAt = new Date("2026-10-20T22:30:00Z");
    const previous = new Date("2026-10-20T21:00:00Z");
    await prisma.airingAlert.upsert({
      where: { userId_anilistId_episode: { userId: me.id, anilistId: ALERT_ANILIST_ID, episode: 4 } },
      create: { userId: me.id, anilistId: ALERT_ANILIST_ID, episode: 4, airingAt, previousAiringAt: previous },
      update: { airingAt, previousAiringAt: previous, seenAt: null },
    });
    const postId = await myPost(request);
    await otherApi.post(`/api/posts/${postId}/comments`, { data: { body: "oi" } });

    await page.goto("/dashboard");
    await page.getByRole("button", { name: "Notificações" }).click();
    const menu = page.getByRole("menu");
    await expect(menu.getByRole("tab", { name: /Lançamentos/ })).toBeVisible();
    await expect(menu.getByRole("tab", { name: /Social/ })).toBeVisible();
    await expect(menu.getByTestId("date-changed").first()).toHaveText("Data alterada");
    await expect(menu.getByText(/antes: /).first()).toBeVisible();

    await menu.getByRole("tab", { name: /Social/ }).click();
    await expect(menu.getByText(/respondeu à sua publicação/)).toBeVisible();
    await menu.getByRole("button", { name: "Marcar Social como lido" }).click();
    await expect(menu.getByRole("tab", { name: "Social" })).toBeVisible();
  });
});
