import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-mobile", workers: 2, retries: process.env.CI ? 1 : 0, timeout: 90_000,
  use: { baseURL: "http://localhost:8082", trace: "retain-on-failure", ...devices["iPhone 13"] },
  webServer: [
    { command: "pnpm dev --port 3001", url: "http://localhost:3001/api/health/live", reuseExistingServer: !process.env.CI, timeout: 120_000 },
    { command: "pnpm --filter @salonny/mobile exec expo start --web --port 8082", url: "http://localhost:8082", reuseExistingServer: !process.env.CI, timeout: 120_000 },
  ],
});
