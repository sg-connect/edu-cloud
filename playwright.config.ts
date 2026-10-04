import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60000,
  use: { baseURL: "http://127.0.0.1:3400", headless: true },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3400",
    reuseExistingServer: true,
    timeout: 120000,
  },
  reporter: "list",
});
