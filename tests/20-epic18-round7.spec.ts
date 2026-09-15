import { test, expect } from "@playwright/test";
import { SESSION_COOKIE_NAME, TEST_ADMIN_SESSION_TOKEN } from "./test-auth";

test.describe("Epic 18 — 7ª rodada de auditoria de UX/UI — coluna Nome fixa no mobile", () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test("rolar a tabela de Usuários até 'Resetar senha' mantém o Nome visível", async ({ page }) => {
    await page.context().addCookies([
      { name: SESSION_COOKIE_NAME, value: TEST_ADMIN_SESSION_TOKEN, domain: "localhost", path: "/" },
    ]);
    await page.goto("/admin");

    const container = page.locator(".MuiTableContainer-root").last();
    const firstNameCell = container.locator("tbody tr").first().locator("td").first();

    await expect(firstNameCell).toBeVisible();
    const beforeBox = await firstNameCell.boundingBox();

    // Rola a tabela pra direita até o botão "Resetar senha" — sem a coluna
    // fixa (achado real da 7ª rodada, Epic 18), a célula do nome saía de
    // vista por completo, deixando quem administra sem saber em qual
    // usuário está prestes a clicar num botão que derruba sessões.
    await container.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect(firstNameCell).toBeVisible();
    const afterBox = await firstNameCell.boundingBox();

    expect(beforeBox).not.toBeNull();
    expect(afterBox).not.toBeNull();
    // A célula continua ancorada na mesma posição horizontal da viewport
    // (sticky left: 0) mesmo com a tabela rolada até o fim.
    expect(afterBox!.x).toBeCloseTo(beforeBox!.x, 0);

    const resetButton = container.locator("tbody tr").first().getByRole("button", { name: "Resetar senha" });
    await expect(resetButton).toBeVisible();
  });
});
