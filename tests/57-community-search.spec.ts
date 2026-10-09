import { test, expect } from "@playwright/test";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

// F10 (SOC-004/005; Figma 13:43738): busca social com escopos, contexto na
// URL (voltar restaura a busca), estados vazios e erro distinto de vazio.
const SUFFIX = Date.now().toString(36);
const WORD = `zebraquantica${SUFFIX}`;

test.describe("Busca na comunidade", () => {
  const created: string[] = [];

  test.afterEach(async ({ request }) => {
    for (const id of created.splice(0)) await request.delete(`/api/posts/${id}`);
  });

  test("API: consulta curta dá 400; publicações, perfis e hashtags retornam por escopo", async ({ request }) => {
    expect((await request.get("/api/search?q=a&scope=posts")).status()).toBe(400);

    const res = await request.post("/api/posts", { data: { body: `Falando de ${WORD} #tag${SUFFIX}` } });
    expect(res.status()).toBe(201);
    created.push((await res.json()).post.id);

    const posts = await (await request.get(`/api/search?q=${WORD}&scope=posts`)).json();
    expect(posts.posts).toHaveLength(1);

    const tags = await (await request.get(`/api/search?q=tag${SUFFIX}&scope=hashtags`)).json();
    expect(tags.hashtags.map((t: { key: string }) => t.key)).toContain(`tag${SUFFIX}`);

    const me = await (await request.get("/api/auth/me")).json();
    const name = (me.user?.displayName ?? me.displayName) as string;
    const profiles = await (await request.get(`/api/search?q=${encodeURIComponent(name.slice(0, 3))}&scope=profiles`)).json();
    expect(profiles.profiles.length).toBeGreaterThan(0);
  });

  test("spoiler nunca aparece nem é casado pela busca de publicações", async ({ request }) => {
    const word = `segredofinal${SUFFIX}`;
    const res = await request.post("/api/posts", { data: { body: `O vilão é ${word}`, isSpoiler: true } });
    expect(res.status()).toBe(201);
    created.push((await res.json()).post.id);
    const raw = await (await request.get(`/api/search?q=${word}&scope=posts`)).text();
    expect(JSON.parse(raw).posts).toHaveLength(0);
    expect(raw).not.toContain(word);
  });

  test("bloqueio: perfis bloqueados somem da busca de perfis", async ({ request, playwright, baseURL }) => {
    const admin = await playwright.request.newContext({
      baseURL,
      extraHTTPHeaders: { Cookie: `${SESSION_COOKIE_NAME}=${TEST_ADMIN_SESSION_TOKEN}` },
    });
    const adminMe = await (await admin.get("/api/auth/me")).json();
    const adminUser = adminMe.user ?? adminMe;
    const q = encodeURIComponent((adminUser.displayName as string).slice(0, 4));
    const before = await (await request.get(`/api/search?q=${q}&scope=profiles`)).json();
    expect(before.profiles.map((p: { id: string }) => p.id)).toContain(adminUser.id);
    expect((await request.put(`/api/users/${adminUser.id}/block`)).status()).toBeLessThan(300);
    try {
      const after = await (await request.get(`/api/search?q=${q}&scope=profiles`)).json();
      expect(after.profiles.map((p: { id: string }) => p.id)).not.toContain(adminUser.id);
    } finally {
      await request.delete(`/api/users/${adminUser.id}/block`);
      await admin.dispose();
    }
  });

  test("UI: buscar no feed, trocar de escopo e voltar restaura a busca", async ({ page, request }) => {
    const res = await request.post("/api/posts", { data: { body: `Procurando ${WORD} por aí #ui${SUFFIX}` } });
    expect(res.status()).toBe(201);
    const post = (await res.json()).post;
    created.push(post.id);

    await page.goto("/");
    await page.getByRole("search").getByRole("textbox").fill(WORD);
    await page.getByRole("button", { name: "Buscar", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/buscar\\?q=${WORD}&scope=posts`));
    await expect(page.getByText(`Procurando ${WORD} por aí`)).toBeVisible();

    await page.getByRole("tab", { name: "Hashtags" }).click();
    await expect(page).toHaveURL(/scope=hashtags/);
    await expect(page.getByTestId("search-empty")).toBeVisible();

    await page.getByRole("tab", { name: "Publicações" }).click();
    await expect(page.getByText(`Procurando ${WORD} por aí`)).toBeVisible();
    // abrir um resultado (perfil do autor) e voltar restaura a mesma busca
    await page.locator('a[href^="/users/"]').first().click();
    await expect(page).toHaveURL(/\/users\//);
    await page.goBack();
    await expect(page).toHaveURL(new RegExp(`/buscar\\?q=${WORD}&scope=posts`));
    await expect(page.getByText(`Procurando ${WORD} por aí`)).toBeVisible();
  });

  test("UI: consulta curta mostra dica; falha de rede mostra erro (não 'sem resultados')", async ({ page }) => {
    await page.goto("/buscar?q=a&scope=profiles");
    await expect(page.getByTestId("search-hint")).toBeVisible();

    await page.route("**/api/search**", (route) => route.fulfill({ status: 500, body: "{}" }));
    await page.goto("/buscar?q=algo&scope=profiles");
    await expect(page.getByText("Não foi possível buscar agora")).toBeVisible();
    await expect(page.getByTestId("search-empty")).toHaveCount(0);
  });

  test("feed: falha ao carregar mostra erro com 'Tentar de novo', não 'Nenhum post ainda'", async ({ page, request }) => {
    // Com posts já carregados na aba anterior: o erro não pode ficar escondido atrás deles.
    const seed = await request.post("/api/posts", { data: { body: `Post de fundo ${SUFFIX}` } });
    created.push((await seed.json()).post.id);
    let hits = 0;
    await page.route(/\/api\/posts\?.*tab=recent/, (route) => {
      hits++;
      return route.fulfill({ status: 500, body: "{}" });
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    await page.getByRole("tab", { name: "Recentes" }).click();
    await expect.poll(() => hits).toBeGreaterThan(0);
    await expect(page.getByText("Não foi possível carregar o feed")).toBeVisible();
    await expect(page.getByText("Nenhum post ainda")).toHaveCount(0);
    await expect(page.getByTestId("for-you-explainer")).toHaveCount(0);
  });

  test("'Para você' explica a regra de ordenação", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("for-you-explainer")).toContainText("mais curtidas");
  });
});
