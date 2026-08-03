import { defineConfig } from "@playwright/test";

// E2E against the running FastAPI server (serves the built app at :8000).
//   npm run build && npm run test:e2e
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.PB_BASE || "http://localhost:8000",
    viewport: { width: 420, height: 912 },
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium" }],
});
