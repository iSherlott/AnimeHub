import { test, expect } from "@playwright/test";

// F6 (D-06/D-07/D-26): Configurações por conta — formato dos títulos,
// fuso horário, notificações em dois canais independentes. Sempre devolve
// as preferências ao padrão no fim, para não contaminar outros specs.
async function resetPreferences(request: import("@playwright/test").APIRequestContext) {
  await request.patch("/api/users/me/settings", {
    data: {
      titleFormat: null,
      timeZone: null,
      notifyReleases: true,
      notifyReplies: true,
      notifyComments: true,
      notifyFollowers: true,
      notifyLikes: false,
    },
  });
}

test.describe("Configurações (Figma 8:3333 / 13:42966)", () => {
  test.afterEach(async ({ request }) => {
    await resetPreferences(request);
  });

  test("API valida e persiste; entradas inválidas devolvem 400 sem alterar nada", async ({ request }) => {
    const ok = await request.patch("/api/users/me/settings", { data: { titleFormat: "romaji", timeZone: "Asia/Tokyo" } });
    expect(ok.status()).toBe(200);
    expect((await ok.json()).preferences).toMatchObject({ titleFormat: "romaji", timeZone: "Asia/Tokyo" });

    for (const data of [{ titleFormat: "klingon" }, { timeZone: "Mars/Olympus" }, { notifyLikes: "sim" }, {}]) {
      const bad = await request.patch("/api/users/me/settings", { data });
      expect(bad.status()).toBe(400);
    }
    const after = await request.get("/api/users/me/settings");
    expect((await after.json()).preferences).toMatchObject({ titleFormat: "romaji", timeZone: "Asia/Tokyo" });

    const noBody = await request.patch("/api/users/me/settings", { headers: { "Content-Type": "application/json" }, data: "null" });
    expect(noBody.status()).toBe(400);
  });

  test("anônimo recebe 401", async ({ playwright, baseURL }) => {
    const anon = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    expect((await anon.get("/api/users/me/settings")).status()).toBe(401);
    expect((await anon.patch("/api/users/me/settings", { data: { notifyLikes: true } })).status()).toBe(401);
    await anon.dispose();
  });

  test("a página salva o formato, o fuso e os toggles, e mostra o sucesso", async ({ page, request }) => {
    await page.goto("/configuracoes");
    await expect(page.getByRole("heading", { level: 1, name: "Configurações" })).toBeVisible();

    await page.getByLabel("Romaji (romaji+inglês)").check();
    await page.getByTestId("timezone-select").click();
    await page.getByRole("option", { name: "Asia/Tokyo" }).click();
    await page.getByLabel("Curtidas").check();
    await page.getByTestId("save-settings").click();

    await expect(page.getByRole("status")).toContainText("Configurações salvas");
    const prefs = (await (await request.get("/api/users/me/settings")).json()).preferences;
    expect(prefs).toMatchObject({ titleFormat: "romaji", timeZone: "Asia/Tokyo", notifyLikes: true });

    // O fuso novo vale já na tela seguinte (rótulo explícito no calendário).
    await page.goto("/calendar");
    await expect(page.getByTestId("calendar-timezone")).toContainText("Asia/Tokyo");
  });

  test("'Desativar todo o Social' desliga os 4 toggles sociais e NÃO toca em Lançamentos", async ({ page, request }) => {
    await page.goto("/configuracoes");
    await page.getByRole("button", { name: "Desativar todo o Social" }).click();
    await page.getByTestId("save-settings").click();
    await expect(page.getByRole("status")).toContainText("Configurações salvas");

    const prefs = (await (await request.get("/api/users/me/settings")).json()).preferences;
    expect(prefs).toMatchObject({
      notifyReleases: true,
      notifyReplies: false,
      notifyComments: false,
      notifyFollowers: false,
      notifyLikes: false,
    });
  });

  test("falha ao salvar mantém os valores, não mostra sucesso e oferece 'Salvar novamente'", async ({ page }) => {
    await page.route("**/api/users/me/settings", (route) =>
      route.request().method() === "PATCH" ? route.fulfill({ status: 500, body: "{}" }) : route.continue()
    );
    await page.goto("/configuracoes");
    await page.getByLabel("Romaji (romaji+inglês)").check();
    await page.getByTestId("save-settings").click();

    await expect(page.getByRole("alert").filter({ hasText: "Não foi possível salvar as configurações" })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expect(page.getByLabel("Romaji (romaji+inglês)")).toBeChecked();
    await expect(page.getByRole("button", { name: "Salvar novamente" })).toBeVisible();
  });

  test("visitante é levado ao login com o destino preservado", async ({ browser }) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await context.newPage();
    await page.goto("/configuracoes");
    await expect(page).toHaveURL(/\/login\?next=%2Fconfiguracoes/);
    await context.close();
  });
});
