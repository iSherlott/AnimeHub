import { test, expect } from "@playwright/test";
import { ANIME_FIXTURES } from "./fixtures/animes";

/**
 * Depende do 02-platform-link.spec.ts já ter criado o link da Crunchyroll
 * para cada anime real (a suíte roda em ordem, workers: 1).
 */
test.describe("Acesso ao link (sem navegar de verdade para fora)", () => {
  for (const anime of ANIME_FIXTURES) {
    test(`o link de "${anime.titleRomaji}" aponta para a Crunchyroll certa e abre em nova aba`, async ({
      page,
    }) => {
      await page.goto("/");
      await page.getByRole("link", { name: anime.titleRomaji }).first().click();

      const anchor = page
        .getByTestId("platform-links")
        .getByTestId("platform-link-open-Crunchyroll");

      await expect(anchor).toHaveAttribute("href", anime.crunchyrollUrl);
      await expect(anchor).toHaveAttribute("target", "_blank");
      await expect(anchor).toHaveAttribute("rel", "noopener noreferrer");
    });
  }
});
