import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-hosted-mobile",
  workers: 2,
  retries: 0,
  timeout: 60_000,
  use: { baseURL: "http://localhost:3001", ...devices["iPhone 13"], trace: "retain-on-failure" },
  webServer: {
    command: "pnpm dev --port 3001",
    url: "http://localhost:3001/api/health/live",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
