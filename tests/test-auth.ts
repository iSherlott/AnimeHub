/**
 * Sessão fixa injetada direto no banco de teste (global-setup.ts) e
 * carregada no navegador via `storageState` do Playwright (playwright.config.ts)
 * — os testes já começam "logados" sem precisar passar pela tela de login,
 * já que a suíte inteira testa a lista pessoal (que agora exige conta).
 */
export const TEST_SESSION_TOKEN =
  "e2e0000000000000000000000000000000000000000000000000000000001";
export const TEST_USER_EMAIL = "e2e@test.local";
export const SESSION_COOKIE_NAME = "session_token";
