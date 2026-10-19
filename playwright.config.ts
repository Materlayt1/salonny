import { defineConfig, devices } from "@playwright/test";

const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "");
const production = process.env.PLAYWRIGHT_PRODUCTION === "1";

export default defineConfig({
  testDir: "./e2e",
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : 3,
  use: { baseURL: externalBaseUrl ?? "http://localhost:3000", trace: "on-first-retry" },
  webServer: externalBaseUrl
    ? undefined
    : { command: production ? "pnpm start" : "pnpm dev", url: "http://localhost:3000", reuseExistingServer: !production },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["iPhone 13"] } },
  ],
});
