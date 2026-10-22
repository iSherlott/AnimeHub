import type { Page } from "@playwright/test";

/**
 * A lista de episódios da página da obra chega em streaming (Suspense, com um esqueleto no lugar). Enquanto a troca não
 * termina, o HTML tem uma cópia escondida do conteúdo e o esqueleto à mostra; os testes esperam isso acabar antes de procurar
 * qualquer coisa da lista.
 */
export async function waitEpisodesStreamed(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector('[data-testid="episodes-skeleton"]') && !document.querySelector('div[hidden][id^="S:"]'));
}
