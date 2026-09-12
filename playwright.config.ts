import { defineConfig, devices } from "@playwright/test";
import { TEST_SERVER_PORT } from "./tests/global-setup";

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
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
