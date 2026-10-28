import { test, expect } from "@playwright/test";

test.describe("Epic 21 — polimento de UX/UI acumulado", () => {
  test("/login redireciona pra home quando já logado", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL("/");
  });

  test("/signup (endereço antigo) leva à home quando já logado", async ({ page }) => {
    await page.goto("/signup");
    await expect(page).toHaveURL("/");
  });
});

test.describe("Epic 21 — /login continua acessível sem sessão; /signup não existe mais (sistema fechado)", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("/login renderiza o formulário sem sessão", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("button", { name: "Entrar" })).toBeVisible();
  });

  test("/signup leva ao login, sem formulário de cadastro", async ({ page }) => {
    await page.goto("/signup");
    await expect(page).toHaveURL("/login");
    await expect(page.getByRole("button", { name: "Criar conta" })).toHaveCount(0);
  });
});
