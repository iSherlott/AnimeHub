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

/** Segunda sessão fixa, para um usuário ADMIN — usada só pelos testes de
 * administração/convite (tests/06-admin-invites.spec.ts), via override local
 * de storageState (a suíte inteira roda com TEST_SESSION_TOKEN por padrão). */
export const TEST_ADMIN_SESSION_TOKEN =
  "a0d00000000000000000000000000000000000000000000000000000000001";
export const TEST_ADMIN_EMAIL = "e2e-admin@test.local";
