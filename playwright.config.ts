import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const dbFile = path.resolve(process.cwd(), "e2e-results/test.db");

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./e2e-results/test-output",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  // Next dev compiles a route on its first request; the login page is on every
  // test's path, so keep headroom above the 30 s default.
  timeout: 60_000,
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testIgnore: /auth\.setup\.ts/,
    },
  ],
  webServer: {
    command: "npm run e2e:prepare && npm run dev",
    url: baseURL,
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      DATABASE_URL: `file:${dbFile}`,
      DB_DRIVER: "sqlite",
      NODE_ENV: "test",
      AUTH_SECRET: "e2e-parity-secret",
      ALLOWED_HOSTNAMES: "localhost,127.0.0.1",
      // Upstream's LoginTest clears the throttler between tests; every e2e
      // test logs in as the same user from the same IP.
      THROTTLE_CAPACITY: "0",
    },
  },
});
