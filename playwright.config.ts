import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./apps/web/tests",
  testMatch: "**/*.e2e.ts",
  reporter: "list",
  webServer: {
    command: "pnpm --filter web exec next dev --hostname 127.0.0.1 --port 3417",
    url: "http://127.0.0.1:3417",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  use: {
    baseURL: "http://127.0.0.1:3417",
  },
  projects: [
    { name: "chromium", use: { browserName: "chromium" } },
    { name: "firefox", use: { browserName: "firefox" } },
    { name: "webkit", use: { browserName: "webkit" } },
  ],
});
