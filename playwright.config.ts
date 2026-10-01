import { defineConfig, devices } from "@playwright/test";
import { E2E_DATABASE_URL } from "./tests/helpers/test-env";

const PORT = 3100;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `node node_modules/next/dist/bin/next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: process.env.PP_LIGHT_REUSE_E2E_SERVER === "1",
    timeout: 180_000,
    env: {
      PP_LIGHT_E2E: "1",
      DATABASE_URL: E2E_DATABASE_URL,
      AUTH_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e",
      AUTH_TRUST_HOST: "true",
      APP_URL: `http://localhost:${PORT}`,
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /mobile\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /mobile\.spec\.ts/ },
  ],
});
