import { test, expect } from "@playwright/test";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// F9 (D-13; Figma 13:42068/13:44169/13:42199): hashtags Unicode com ID
// canônico, limite por publicação, links clicáveis, página da hashtag com
// Recentes/Em alta, e respeito a bloqueio/spoiler.
const SUFFIX = Date.now().toString(36);
const TAG_ASCII = `Mistério${SUFFIX}`;
const TAG_JP = `進撃${SUFFIX}`;

test.describe("Hashtags", () => {
  const created: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of created.splice(0)) await request.delete(`/api/posts/${id}`);
  });

  test("ID canônico: maiúsculas e acentos equivalentes caem na mesma hashtag; Unicode funciona", async ({ request }) => {
    const a = await request.post("/api/posts", { data: { body: `Primeira #${TAG_ASCII} e #${TAG_JP}` } });
    expect(a.status()).toBe(201);
    created.push((await a.json()).post.id);
    const b = await request.post("/api/posts", { data: { body: `Segunda #${TAG_ASCII.toUpperCase()}` } });
    expect(b.status()).toBe(201);
    created.push((await b.json()).post.id);

    const key = encodeURIComponent(TAG_ASCII.toLowerCase());
    const info = await request.get(`/api/hashtags/${key}`);
    expect(info.status()).toBe(200);
    expect((await info.json()).hashtag.postCount).toBe(2);

    const jp = await request.get(`/api/hashtags/${encodeURIComponent(TAG_JP)}`);
    expect(jp.status()).toBe(200);
    expect((await jp.json()).hashtag.postCount).toBe(1);
  });

  test("limite de 5 hashtags por publicação", async ({ request }) => {
    const ok = await request.post("/api/posts", { data: { body: "#a1 #b2 #c3 #d4 #e5 cinco ok" } });
    expect(ok.status()).toBe(201);
    created.push((await ok.json()).post.id);
    const tooMany = await request.post("/api/posts", { data: { body: "#a1 #b2 #c3 #d4 #e5 #f6 seis" } });
    expect(tooMany.status()).toBe(400);
  });

  test("hashtag aparece como link e leva à página com Recentes e Em alta", async ({ page, request }) => {
    const res = await request.post("/api/posts", { data: { body: `Texto com #${TAG_ASCII}link no meio` } });
    expect(res.status()).toBe(201);
    created.push((await res.json()).post.id);

    await page.goto("/");
    await page.getByRole("tab", { name: "Recentes" }).click();
    const link = page.getByTestId("hashtag-link").filter({ hasText: `#${TAG_ASCII}link` }).first();
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/hashtag\//);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(`${TAG_ASCII}link`);
    await expect(page.getByTestId("hashtag-count")).toContainText("1 publicação");
    await expect(page.getByText(`Texto com #${TAG_ASCII}link no meio`)).toBeVisible();
    await page.getByRole("tab", { name: "Em alta" }).click();
    await expect(page.getByText(`Texto com #${TAG_ASCII}link no meio`)).toBeVisible();
  });

  test("hashtag inexistente dá 404", async ({ request }) => {
    expect((await request.get("/api/hashtags/nao-existe-xyz-999")).status()).toBe(404);
  });

  test("spoiler: texto não vaza na lista da hashtag", async ({ request }) => {
    const secret = `Segredo do final ${SUFFIX}`;
    const res = await request.post("/api/posts", { data: { body: `${secret} #spoil${SUFFIX}`, isSpoiler: true } });
    expect(res.status()).toBe(201);
    created.push((await res.json()).post.id);
    const list = await request.get(`/api/hashtags/${encodeURIComponent(`spoil${SUFFIX}`)}/posts?tab=recent`);
    expect(list.status()).toBe(200);
    const raw = await list.text();
    expect(raw).not.toContain(secret);
    expect(JSON.parse(raw).posts[0].isSpoiler).toBe(true);
  });

  test("bloqueio: quem eu bloqueio some da lista da hashtag", async ({ request, playwright, baseURL }) => {
    const tag = `bloq${SUFFIX}`;
    const adminCtx = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    const adminPost = await adminCtx.post("/api/posts", { data: { body: `Post do admin #${tag}` } });
    expect(adminPost.status()).toBe(201);
    const adminPostJson = (await adminPost.json()).post;
    const adminId = adminPostJson.author.id as string;

    const before = await (await request.get(`/api/hashtags/${tag}/posts?tab=recent`)).json();
    expect(before.posts.map((p: { id: string }) => p.id)).toContain(adminPostJson.id);

    expect((await request.put(`/api/users/${adminId}/block`)).status()).toBeLessThan(300);
    try {
      const after = await (await request.get(`/api/hashtags/${tag}/posts?tab=recent`)).json();
      expect(after.posts.map((p: { id: string }) => p.id)).not.toContain(adminPostJson.id);
    } finally {
      await request.delete(`/api/users/${adminId}/block`);
      await adminCtx.delete(`/api/posts/${adminPostJson.id}`);
      await adminCtx.dispose();
    }
  });
});
