import { defineConfig, devices } from "@playwright/test";
import { TEST_SERVER_PORT } from "./tests/global-setup";
import { SESSION_COOKIE_NAME, TEST_SESSION_TOKEN } from "./tests/test-auth";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  globalSetup: require.resolve("./tests/global-setup.ts"),
  use: {
    baseURL: `http://localhost:${TEST_SERVER_PORT}`,
    trace: "retain-on-failure",
    // A suíte testa a lista pessoal, que agora exige login — os testes já
    // começam autenticados com a sessão fixa criada em global-setup.ts, sem
    // precisar passar pela tela de login em cada um.
    storageState: {
      cookies: [
        {
          name: SESSION_COOKIE_NAME,
          value: TEST_SESSION_TOKEN,
          domain: "localhost",
          path: "/",
          expires: Math.floor(Date.now() / 1000) + 365 * 24 * 3600,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
