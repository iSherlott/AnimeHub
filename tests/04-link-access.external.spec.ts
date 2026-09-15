import { test, expect } from "@playwright/test";
import { ANIME_FIXTURES } from "./fixtures/animes";

/**
 * Teste opt-in: realmente abre crunchyroll.com pela rede para confirmar que
 * o link leva ao título certo. Não roda no `npm test` padrão (tag @external)
 * — só via `npm run test:external`, e só de vez em quando (não em CI), pra
 * não gerar tráfego repetido no site deles.
 *
 * Roda via `--grep @external`, ou seja, sozinho — por isso cria o próprio
 * link em vez de depender do 02-platform-link.spec.ts já ter rodado antes.
 */
test.describe("Acesso real à Crunchyroll (rede externa) @external", () => {
  for (const anime of ANIME_FIXTURES) {
    test(`abre "${anime.titleRomaji}" na Crunchyroll de verdade @external`, async ({
      page,
      context,
    }) => {
      await page.goto("/minha-lista");
      await page.getByRole("link", { name: anime.titleRomaji }).first().click();

      const linksSection = page.getByTestId("platform-links");
      await linksSection.getByTestId("platform-select").selectOption("Crunchyroll");
      await linksSection.getByTestId("platform-url-input").fill(anime.crunchyrollUrl);
      await linksSection.getByTestId("platform-link-submit").click();

      const anchor = linksSection.getByTestId("platform-link-open-Crunchyroll");
      await expect(anchor).toHaveAttribute("href", anime.crunchyrollUrl);

      const [newPage] = await Promise.all([
        context.waitForEvent("page"),
        anchor.click(),
      ]);
      await newPage.waitForLoadState("domcontentloaded");

      expect(new URL(newPage.url()).hostname).toBe("www.crunchyroll.com");
      await newPage.close();
    });
  }
});
