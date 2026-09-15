import { test, expect } from "@playwright/test";
import { ANIME_FIXTURES, UTILITY_FIXTURE } from "./fixtures/animes";

test.describe("Criação de link de plataforma (Crunchyroll)", () => {
  for (const anime of ANIME_FIXTURES) {
    test(`cria e persiste o link da Crunchyroll para "${anime.titleRomaji}"`, async ({
      page,
    }) => {
      await page.goto("/minha-lista");
      await page.getByRole("link", { name: anime.titleRomaji }).first().click();
      await expect(page.getByTestId("anime-title")).toHaveText(
        anime.titleRomaji
      );

      const linksSection = page.getByTestId("platform-links");
      await expect(
        linksSection.getByText("Nenhuma plataforma vinculada ainda.")
      ).toBeVisible();

      await linksSection.getByTestId("platform-link-add-toggle").click();
      await linksSection.getByTestId("platform-select").selectOption("Crunchyroll");
      await linksSection.getByTestId("platform-url-input").fill(anime.crunchyrollUrl);
      await linksSection.getByTestId("platform-link-submit").click();

      const anchor = linksSection.getByTestId("platform-link-open-Crunchyroll");
      await expect(anchor).toBeVisible();
      await expect(anchor).toHaveAttribute("href", anime.crunchyrollUrl);
      await expect(
        linksSection.getByText("Nenhuma plataforma vinculada ainda.")
      ).not.toBeVisible();

      // persiste após recarregar a página (foi realmente salvo no banco)
      await page.reload();
      const anchorAfterReload = page
        .getByTestId("platform-links")
        .getByTestId("platform-link-open-Crunchyroll");
      await expect(anchorAfterReload).toHaveAttribute(
        "href",
        anime.crunchyrollUrl
      );
    });
  }

  test("remove um link vinculado", async ({ page }) => {
    const anime = UTILITY_FIXTURE;
    await page.goto("/minha-lista");
    await page.getByRole("link", { name: anime.titleRomaji }).first().click();

    const linksSection = page.getByTestId("platform-links");
    await linksSection.getByTestId("platform-link-add-toggle").click();
    await linksSection.getByTestId("platform-select").selectOption("Crunchyroll");
    await linksSection.getByTestId("platform-url-input").fill(anime.crunchyrollUrl);
    await linksSection.getByTestId("platform-link-submit").click();
    await expect(
      linksSection.getByTestId("platform-link-open-Crunchyroll")
    ).toBeVisible();

    await linksSection.getByTestId("platform-link-remove-Crunchyroll").click();
    await expect(
      linksSection.getByTestId("platform-link-open-Crunchyroll")
    ).not.toBeVisible();
    await expect(
      linksSection.getByText("Nenhuma plataforma vinculada ainda.")
    ).toBeVisible();
  });

  test("rejeita vincular sem preencher a URL", async ({ page }) => {
    const anime = UTILITY_FIXTURE;
    await page.goto("/minha-lista");
    await page.getByRole("link", { name: anime.titleRomaji }).first().click();

    const linksSection = page.getByTestId("platform-links");
    await linksSection.getByTestId("platform-link-add-toggle").click();
    await linksSection.getByTestId("platform-link-submit").click();

    await expect(
      linksSection.getByText("Nenhuma plataforma vinculada ainda.")
    ).toBeVisible();
  });
});
