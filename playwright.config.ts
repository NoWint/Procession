import { defineConfig, devices } from "@playwright/test";

// Playwright E2E config for Procession (I-701).
//
// Notes:
// - The Vite dev server (vite.config.ts) is pinned to port 1420 with
//   strictPort: true (Tauri convention). We mirror that here so `npm run dev`
//   started by the webServer block matches the URL the tests navigate to.
// - Chromium-only because the smoke test only verifies that the app window
//   opens and the R3F canvas mounts. Cross-browser coverage is out of scope
//   for this infrastructure task.
// - 1 worker / 0 retries: smoke suite is small and must surface flakiness,
//   not mask it.

const PORT = 1420;
// Note: Vite v7 with `host: false` (the project default in vite.config.ts)
// binds to IPv6 `::1` only, not IPv4 127.0.0.1. Using `localhost` here lets
// the OS resolver pick the right address family.
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  headless: true,
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    // Always reuse a running dev server if one is present — the user may
    // already have `npm run dev` running in another terminal.
    reuseExistingServer: true,
    // Vite cold-start for this project (Three.js + R3F + postprocessing)
    // routinely exceeds 30s on first invoke; 60s gives comfortable headroom.
    timeout: 60_000,
  },
});
