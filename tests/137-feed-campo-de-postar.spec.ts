import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { TEST_DB_URL } from "./test-db";
import { TEST_USER_EMAIL } from "./test-auth";

// Campo de postar no topo do Feed, como no X (no lugar do botão "+ Nova publicação"): avatar e "O que está
// acontecendo?"; ao focar, a barra (anime relacionado, hashtag, spoiler, editor completo) e o Postar, que só acende com
// texto. A publicação nova entra no topo da lista sem sair do Feed; o rascunho segue para o editor completo.
const TAG = "Campo137";

test.describe.serial("Feed: campo de postar", () => {
  let prisma: PrismaClient;
  let userId = "";

  test.beforeAll(async () => {
    prisma = new PrismaClient({ datasourceUrl: TEST_DB_URL });
    userId = (await prisma.user.findUniqueOrThrow({ where: { email: TEST_USER_EMAIL } })).id;
    await prisma.post.deleteMany({ where: { userId, body: { contains: TAG } } });
  });

  test.afterAll(async () => {
    await prisma.post.deleteMany({ where: { userId, body: { contains: TAG } } });
    await prisma.$disconnect();
  });

  test("o topo do Feed tem o campo, não o botão; Postar só acende com texto", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: "+ Nova publicação" })).toHaveCount(0);
    const field = page.getByRole("textbox", { name: "O que está acontecendo?" });
    await expect(field).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Opções da publicação" })).toHaveCount(0);
    await field.click();
    const toolbar = page.getByRole("toolbar", { name: "Opções da publicação" });
    for (const name of ["Anime relacionado", "Inserir hashtag", "Spoiler", "Abrir editor completo"]) await expect(toolbar.getByRole(/editor/.test(name) ? "link" : "button", { name })).toBeVisible();
    await expect(page.getByTestId("composer-post")).toBeDisabled();
    await field.fill("   ");
    await expect(page.getByTestId("composer-post")).toBeDisabled();
  });

  test("posta sem sair do Feed: a publicação aparece no topo, com hashtag e spoiler", async ({ page }) => {
    await page.goto("/");
    const field = page.getByRole("textbox", { name: "O que está acontecendo?" });
    await field.click();
    await field.fill(`Primeira impressão ${TAG}`);
    await page.getByRole("button", { name: "Inserir hashtag" }).click();
    await page.keyboard.type(TAG);
    await expect(field).toHaveValue(`Primeira impressão ${TAG} #${TAG}`);
    // O botão Spoiler abre o menu: a publicação inteira ou um trecho.
    const spoiler = page.getByRole("toolbar", { name: "Opções da publicação" }).getByRole("button", { name: "Spoiler", exact: true });
    await spoiler.click();
    await page.getByRole("menuitemcheckbox", { name: /A publicação inteira tem spoiler/ }).click();
    await expect(spoiler).toHaveAttribute("aria-pressed", "true");
    await page.getByTestId("composer-post").click();

    await expect(field).toHaveValue("");
    await expect(page).toHaveURL(/localhost:\d+\/$/);
    const saved = await prisma.post.findFirstOrThrow({ where: { userId, body: { contains: TAG } }, orderBy: { createdAt: "desc" } });
    expect(saved).toMatchObject({ body: `Primeira impressão ${TAG} #${TAG}`, isSpoiler: true });
    // Topo da lista: a primeira publicação depois do campo é a nova (com spoiler, o texto fica oculto até revelar).
    const card = page.getByTestId(`post-card-${saved.id}`);
    await expect(card).toBeVisible();
    const first = page.locator('[data-testid^="post-card-"]').first();
    await expect(first).toHaveAttribute("data-testid", `post-card-${saved.id}`);
  });

  test("Ctrl+Enter também posta", async ({ page }) => {
    await page.goto("/");
    const field = page.getByRole("textbox", { name: "O que está acontecendo?" });
    await field.click();
    await field.fill(`Atalho ${TAG}`);
    await field.press("Control+Enter");
    await expect(field).toHaveValue("");
    await expect.poll(() => prisma.post.count({ where: { userId, body: `Atalho ${TAG}` } })).toBe(1);
  });

  test("o rascunho segue para o editor completo", async ({ page }) => {
    await page.goto("/");
    const field = page.getByRole("textbox", { name: "O que está acontecendo?" });
    await field.click();
    await field.fill(`Rascunho longo ${TAG}`);
    await page.getByRole("link", { name: "Abrir editor completo" }).click();
    await expect(page).toHaveURL(/\/publicar$/);
    await expect(page.getByPlaceholder("Que conversa você quer começar?")).toHaveValue(`Rascunho longo ${TAG}`);
    // Limpa o rascunho para não vazar para outros testes.
    await page.getByPlaceholder("Que conversa você quer começar?").fill("");
  });

  test("no celular o campo cabe na tela, com alvos de toque de 44 px", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");
    const field = page.getByRole("textbox", { name: "O que está acontecendo?" });
    await field.click();
    const composer = page.getByTestId("feed-composer");
    const box = (await composer.boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(375);
    for (const name of ["Anime relacionado", "Inserir hashtag", "Spoiler"]) {
      const b = (await page.getByRole("toolbar", { name: "Opções da publicação" }).getByRole("button", { name, exact: true }).boundingBox())!;
      expect(b.width, name).toBeGreaterThanOrEqual(44);
      expect(b.height, name).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
  });
});
