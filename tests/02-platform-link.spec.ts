import { test, expect } from "@playwright/test";
import { ANIME_FIXTURES, UTILITY_FIXTURE } from "./fixtures/animes";

test.describe("Criação de link de plataforma (Crunchyroll)", () => {
  // O padrão de título agora é Japonês (D-06); estes testes localizam a obra
  // pelo título em romaji, então usam a escolha local do menu de títulos.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem("anime-hub:title-preference", JSON.stringify({ language: "ja", japaneseScript: "romaji" }));
    });
  });

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

  test("'Irregular' guarda o link de um site não oficial, com rótulo próprio, e persiste", async ({ page }) => {
    const anime = UTILITY_FIXTURE;
    const url = "https://exemplo-irregular.test/assistir/123";
    await page.goto("/minha-lista");
    await page.getByRole("link", { name: anime.titleRomaji }).first().click();

    const linksSection = page.getByTestId("platform-links");
    await linksSection.getByTestId("platform-link-add-toggle").click();
    await linksSection.getByTestId("platform-select").selectOption("Irregular");
    await expect(linksSection.getByTestId("platform-irregular-hint")).toBeVisible();
    await linksSection.getByTestId("platform-url-input").fill(url);
    await linksSection.getByTestId("platform-link-submit").click();

    const anchor = linksSection.getByTestId("platform-link-open-Irregular");
    await expect(anchor).toHaveText("Assistir (irregular)");
    await expect(anchor).toHaveAttribute("href", url);

    await page.reload();
    await expect(page.getByTestId("platform-links").getByTestId("platform-link-open-Irregular")).toHaveAttribute("href", url);

    // Limpa para não interferir nos outros testes.
    await page.getByTestId("platform-links").getByTestId("platform-link-remove-Irregular").click();
    await expect(page.getByTestId("platform-links").getByTestId("platform-link-open-Irregular")).toHaveCount(0);
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
