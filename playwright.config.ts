import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["html", { open: "never" }], ["github"]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  expect: {
    timeout: 10_000,
  },
  timeout: 90_000,
  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-chromium",
      grep: /@mobile/,
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    env: {
      ...process.env,
      NEXT_PUBLIC_SITE_URL: baseURL,
      RECEIPT_EXTRACTOR: "fake",
    },
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    timeout: 120_000,
    url: baseURL,
  },
});
