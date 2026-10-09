import { test, expect } from "@playwright/test";
import { ANIME_FIXTURES } from "./fixtures/animes";

test.describe("Frontend — catálogo pessoal (/minha-lista)", () => {
  test("mostra a navegação e todos os animes acompanhados", async ({ page }) => {
    await page.goto("/minha-lista");

    await expect(page.getByRole("link", { name: "Anime Hub" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Minha lista" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Explorar" })).toBeVisible();

    for (const anime of ANIME_FIXTURES) {
      await expect(
        page.getByRole("link", { name: anime.titleRomaji }).first()
      ).toBeVisible();
    }
  });

  test("clicar em um card abre a página de detalhe do anime correto", async ({
    page,
  }) => {
    const target = ANIME_FIXTURES[1]; // Kaiju No. 8
    await page.goto("/minha-lista");

    await page.getByRole("link", { name: target.titleRomaji }).first().click();

    await expect(page).toHaveURL(/\/anime\//);
    await expect(page.getByTestId("anime-title")).toHaveText(
      target.titleRomaji
    );
  });

  test("navega entre Minha lista e Explorar pelo menu", async ({ page }) => {
    await page.goto("/minha-lista");
    await page.getByRole("link", { name: "Explorar" }).click();
    await expect(page).toHaveURL(/\/discover/);
    await expect(page.getByPlaceholder("Buscar anime...")).toBeVisible();

    await page.getByRole("link", { name: "Minha lista" }).click();
    await expect(page).toHaveURL("/minha-lista");
  });
});
